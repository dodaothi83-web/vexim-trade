#!/usr/bin/env node
// node --experimental-strip-types --no-warnings scripts/migrate-aplus-images-webp.mjs            (chạy thử, không ghi)
// node --experimental-strip-types --no-warnings scripts/migrate-aplus-images-webp.mjs --apply    (chuyển đổi + cập nhật nội dung)
// node --experimental-strip-types --no-warnings scripts/migrate-aplus-images-webp.mjs --apply --delete-originals
//
// Chuyển ảnh A+ cũ (JPEG/PNG do trình duyệt nén) sang đúng định dạng ảnh A+ mới:
//   aplus/<ncc>/<sản phẩm|company>/<uuid>.jpg  →  <uuid>.webp (≤1600px) + <uuid>-thumb.webp (≤640px)
// dùng chính prepareSupplierProductImage (cùng sharp, cùng thông số như lúc tải lên), rồi thay đường
// dẫn trong supplier_products.aplus_content và suppliers.company_aplus. Không đổi schema.
//
// - Chạy lại an toàn: ảnh WebP đã có thì không mã hoá lại; nội dung đã đổi thì bỏ qua.
// - Không đụng thư mục `pending` (tệp chờ tự dọn sau 24 giờ, đang được bảng chờ tham chiếu).
// - Ảnh gốc chỉ bị xoá khi có --delete-originals, sau khi WebP đã lên và không còn nội dung nào trỏ tới.
//
// Cần SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY (đọc từ môi trường hoặc .env.local / .env).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const LEGACY_APLUS_IMAGE = /^aplus\/[a-f0-9-]{36}\/(?:[a-f0-9-]{36}|company)\/[a-f0-9-]{36}\.(?:jpe?g|png)$/i;

/** Đường dẫn WebP và bản nhỏ tương ứng với một ảnh A+ cũ. */
export function webpTargets(legacyPath) {
  const base = legacyPath.replace(/\.(?:jpe?g|png)$/i, "");
  return { main: `${base}.webp`, thumb: `${base}-thumb.webp` };
}

/** Ảnh A+ cũ cần chuyển (bỏ thư mục chờ, bỏ tệp đã là WebP). */
export function legacyAplusImages(names) {
  return names.filter((name) => LEGACY_APLUS_IMAGE.test(name));
}

/**
 * Thay đường dẫn ảnh trong nội dung A+ (mảng khối JSON). Chỉ thay chuỗi trùng KHỚP HOÀN TOÀN với
 * một đường dẫn cũ, không đụng chữ nội dung. Trả `{ value, changed }`.
 */
export function rewriteAplusPaths(value, replacements) {
  let changed = 0;
  const walk = (node) => {
    if (typeof node === "string") {
      const next = replacements.get(node);
      if (next) { changed++; return next; }
      return node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([key, child]) => [key, walk(child)]));
    return node;
  };
  const next = walk(value);
  return { value: changed ? next : value, changed };
}

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const full = path.join(process.cwd(), file);
    if (!fs.existsSync(full)) continue;
    for (const raw of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const key = line.slice(0, line.indexOf("=")).trim();
      const value = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

async function listAll(storage, prefix) {
  const out = [];
  const { data, error } = await storage.list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const entry of data ?? []) {
    const full = `${prefix}/${entry.name}`;
    if (entry.id === null) out.push(...await listAll(storage, full)); // thư mục
    else out.push(full);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const deleteOriginals = process.argv.includes("--delete-originals");
  loadEnv();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error("Thiếu SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY."); process.exit(2); }
  const { createClient } = await import("@supabase/supabase-js");
  const { prepareSupplierProductImage } = await import("../lib/media/prepare-supplier-product-image.ts");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const storage = db.storage.from(process.env.SUPABASE_MEDIA_BUCKET || "vexim-media");

  const names = await listAll(storage, "aplus");
  const existing = new Set(names);
  const legacy = legacyAplusImages(names);
  console.log(`${apply ? "Chạy thật" : "Chạy thử"}: ${legacy.length} ảnh A+ cũ cần chuyển.`);

  const replacements = new Map();
  for (const from of legacy) {
    const { main: to, thumb } = webpTargets(from);
    if (existing.has(to) && existing.has(thumb)) {
      console.log(`  = ${from} → đã có WebP`);
      replacements.set(from, to);
      continue;
    }
    const { data, error } = await storage.download(from);
    if (error || !data) { console.error(`  ✖ ${from}: không tải được`, error?.message ?? ""); continue; }
    const original = new Uint8Array(await data.arrayBuffer());
    const prepared = await prepareSupplierProductImage(original);
    console.log(`  → ${from}: ${Math.round(original.length / 1024)} KB → ${Math.round(prepared.main.length / 1024)} KB WebP ${prepared.width}×${prepared.height} + bản nhỏ ${Math.round(prepared.thumb.length / 1024)} KB`);
    if (apply) {
      for (const [target, bytes] of [[to, prepared.main], [thumb, prepared.thumb]]) {
        const { error: uploadError } = await storage.upload(target, bytes, { contentType: "image/webp", upsert: true });
        if (uploadError) throw new Error(`${target}: ${uploadError.message}`);
      }
    }
    replacements.set(from, to);
  }

  const targets = [
    { table: "supplier_products", column: "aplus_content" },
    { table: "suppliers", column: "company_aplus" },
  ];
  const stillReferenced = new Set();
  for (const { table, column } of targets) {
    const { data, error } = await db.from(table).select(`id, ${column}`).not(column, "is", null);
    if (error) throw error;
    for (const row of data ?? []) {
      const { value, changed } = rewriteAplusPaths(row[column], replacements);
      if (!changed) continue;
      console.log(`  ✎ ${table}.${column} ${row.id}: ${changed} đường dẫn`);
      if (!apply) continue;
      const { error: updateError } = await db.from(table).update({ [column]: value }).eq("id", row.id);
      if (updateError) throw updateError;
    }
    // Sau khi cập nhật: còn chỗ nào trỏ tới ảnh cũ thì không xoá ảnh đó.
    const { data: after } = await db.from(table).select(column).not(column, "is", null);
    for (const row of after ?? []) for (const from of replacements.keys()) if (JSON.stringify(row[column]).includes(from)) stillReferenced.add(from);
  }

  if (apply && deleteOriginals) {
    const removable = [...replacements.keys()].filter((from) => !stillReferenced.has(from));
    if (removable.length) {
      const { error } = await storage.remove(removable);
      if (error) throw error;
    }
    console.log(`  🗑 Đã xoá ${removable.length} ảnh gốc${stillReferenced.size ? `, giữ ${stillReferenced.size} ảnh còn được tham chiếu` : ""}.`);
  }
  console.log(apply ? "✅ Xong." : "Chạy thử xong. Thêm --apply để ghi.");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => { console.error(error); process.exit(1); });
}
