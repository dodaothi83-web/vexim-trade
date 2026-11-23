/**
 * Kiểm tra luồng ảnh mới trên Cloudflare R2 (lib/media/storage.ts, lib/media/r2.ts,
 * lib/media/public-url.ts, lib/media/prepare-supplier-profile-image.ts):
 *  - ảnh đại diện/ảnh bìa `profile-r2-…`/`cover-r2-…` → bucket R2 công khai, link trực tiếp;
 *  - ảnh sản phẩm, ảnh form, ảnh A+ → chỉ bucket R2 riêng tư, không bao giờ vào bucket công khai;
 *  - giấy tờ, kho NCC, showcase, danh mục, blog → vẫn Supabase;
 *  - ảnh cũ chưa có trên R2 vẫn đọc từ Supabase; thiếu cấu hình R2 thì giữ hành vi cũ;
 *  - ảnh hồ sơ được nén WebP, xoay đúng chiều, bỏ metadata, giữ nền trong suốt.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";

import * as publicUrl from "../lib/media/public-url.ts";
import { prepareSupplierProfileImage } from "../lib/media/prepare-supplier-profile-image.ts";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function load(path, mocks, env) {
  const exports = {};
  const js = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, {
    exports, console: { warn() {}, error() {}, log() {} }, process: { env, cwd: () => "/tmp/vexim-r2-check" },
    Date, Map, Set, Error, Uint8Array, Buffer, globalThis: {},
    require: (name) => {
      if (name === "server-only") return {};
      assert.ok(name in mocks, `${path}: unexpected import ${name}`);
      return mocks[name];
    },
  }, { filename: path });
  return exports;
}

/** Kho giả: ghi lại mọi thao tác theo bucket để khẳng định ảnh nằm đúng chỗ. */
function harness({ env = {}, supabaseFiles = {} } = {}) {
  const r2 = new Map(); // `${bucket}/${key}` → { data, contentType, cacheControl }
  const supabase = new Map(Object.entries(supabaseFiles).map(([k, v]) => [k, new Uint8Array(Buffer.from(v))]));
  const log = [];
  const fullEnv = { R2_ACCOUNT_ID: "acc", R2_ACCESS_KEY_ID: "key", R2_SECRET_ACCESS_KEY: "secret", ...env };
  const r2Module = load("../lib/media/r2.ts", {
    "@aws-sdk/client-s3": fakeS3(r2, log),
  }, fullEnv);
  const supabaseClient = {
    storage: {
      from: (bucket) => ({
        upload: async (path, data) => { log.push(["supabase.upload", bucket, path]); supabase.set(path, data); return { error: null }; },
        download: async (path) => {
          log.push(["supabase.download", bucket, path]);
          const data = supabase.get(path);
          return data ? { data: new Blob([data]), error: null } : { data: null, error: { message: "Object not found", statusCode: "404" } };
        },
        remove: async ([path]) => { log.push(["supabase.remove", bucket, path]); supabase.delete(path); return { error: null }; },
      }),
    },
  };
  const storage = load("../lib/media/storage.ts", {
    "node:fs/promises": { default: { rm: async () => {} } },
    "node:path": { default: { join: (...parts) => parts.join("/") } },
    "@/lib/db/supabase": { getSupabaseClient: () => supabaseClient, supabaseConfigured: () => true },
    "@/lib/db": { localFallbackAllowed: () => false },
    "@/lib/media/r2": r2Module,
    "@/lib/media/public-url": publicUrl,
  }, fullEnv);
  return { storage, r2, supabase, log, r2Module };
}

function fakeS3(objects, log) {
  class Command { constructor(input) { this.input = input; } }
  class PutObjectCommand extends Command {}
  class GetObjectCommand extends Command {}
  class HeadObjectCommand extends Command {}
  class DeleteObjectCommand extends Command {}
  class S3Client {
    constructor(config) { this.config = config; log.push(["s3.client", config.endpoint, config.region]); }
    async send(command) {
      const { Bucket, Key } = command.input;
      const id = `${Bucket}/${Key}`;
      const missing = () => Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey", $metadata: { httpStatusCode: 404 } });
      if (command instanceof PutObjectCommand) {
        log.push(["r2.put", Bucket, Key]);
        objects.set(id, { data: command.input.Body, contentType: command.input.ContentType, cacheControl: command.input.CacheControl });
        return {};
      }
      if (command instanceof HeadObjectCommand) { if (!objects.has(id)) throw missing(); return {}; }
      if (command instanceof GetObjectCommand) {
        log.push(["r2.get", Bucket, Key]);
        const hit = objects.get(id);
        if (!hit) throw missing();
        return { Body: { transformToByteArray: async () => hit.data } };
      }
      if (command instanceof DeleteObjectCommand) { log.push(["r2.delete", Bucket, Key]); objects.delete(id); return {}; }
      throw new Error("unexpected command");
    }
  }
  return { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand };
}

const SUP = "2a231e17-d844-4019-9f8d-26abd44b58e2";
const UUID = "54cb81d8-fdf2-4600-b2eb-60b934b3c408";
const PROD = "64a3ac4a-0013-4e3b-8062-6938be590927";
const bytes = new Uint8Array([1, 2, 3]);
const configured = { R2_BUCKET_NAME: "veximtrade-media", R2_PUBLIC_URL: "https://media.veximtrade.com", R2_PRIVATE_BUCKET_NAME: "veximtrade-private" };

// 1) Đủ cấu hình: ảnh hồ sơ lên bucket công khai, ảnh sản phẩm/A+ lên bucket riêng tư.
{
  const { storage, r2, log } = harness({ env: configured });
  const profile = storage.supplierProfileImagePath(SUP, "profile", UUID);
  assert.equal(profile, `suppliers/${SUP}/profile-r2-${UUID}.webp`);
  assert.equal(storage.supplierProfileImagePath(SUP, "cover", UUID), `suppliers/${SUP}/cover-r2-${UUID}.webp`);
  assert.equal((await storage.putObject(profile, bytes, "image/webp")).driver, "r2");
  const stored = r2.get(`veximtrade-media/${profile}`);
  assert.ok(stored, "Profile photos go to the public R2 bucket");
  assert.equal(stored.contentType, "image/webp");
  assert.match(stored.cacheControl, /immutable/, "Random, never-overwritten public files are cached long by the CDN");

  for (const path of [`products/${PROD}/${UUID}.webp`, `products/${PROD}/${UUID}-thumb.webp`, `aplus/${SUP}/${PROD}/${UUID}.webp`, `aplus/${SUP}/company/${UUID}-thumb.webp`]) {
    await storage.putObject(path, bytes, "image/webp");
    assert.ok(r2.has(`veximtrade-private/${path}`), `${path} goes to the private bucket`);
    assert.ok(!r2.has(`veximtrade-media/${path}`), `${path} never goes to the public bucket`);
  }
  await storage.putNewObject(`product-form-images/${PROD}/${UUID}.webp`, bytes, "image/webp");
  assert.ok(r2.has(`veximtrade-private/product-form-images/${PROD}/${UUID}.webp`));
  await assert.rejects(storage.putNewObject(`product-form-images/${PROD}/${UUID}.webp`, bytes, "image/webp"), /không ghi đè/, "Write-once form images are never overwritten");

  // Giấy tờ, kho NCC, showcase, ảnh hồ sơ đặt tên kiểu cũ, danh mục, blog: vẫn Supabase.
  for (const path of [`suppliers/${SUP}/${UUID}.jpg`, `suppliers/${SUP}/showcase-${UUID}.jpg`, `suppliers/${SUP}/profile-${UUID}.jpg`, "categories/coffee.jpg", "blog/post.png", `verifications/${SUP}/gcn.pdf`]) {
    const before = r2.size;
    assert.equal((await storage.putObject(path, bytes, "image/jpeg")).driver, "supabase", `${path} stays on Supabase`);
    assert.equal(r2.size, before, `${path} is never written to R2`);
  }

  // Đọc: R2 trước; ảnh cũ chưa có trên R2 thì lấy từ Supabase.
  assert.equal((await storage.getObject(profile)).driver, "r2");
  log.length = 0;
  const legacy = harness({ env: configured, supabaseFiles: { [`products/${PROD}/old.jpg`]: "old", [`suppliers/${SUP}/profile-old.jpg`]: "old" } });
  const oldProduct = await legacy.storage.getObject(`products/${PROD}/old.jpg`);
  assert.equal(oldProduct.driver, "supabase", "Old product photos keep loading from Supabase");
  assert.equal(Buffer.from(oldProduct.data).toString(), "old");
  assert.equal((await legacy.storage.getObject(`suppliers/${SUP}/profile-old.jpg`)).driver, "supabase", "Old profile photos keep loading from Supabase");
  assert.ok(!legacy.log.some(([op]) => op === "supabase.upload" || op === "supabase.remove"), "Reading never changes old data");

  // Xoá: ảnh hồ sơ mới chỉ xoá trên R2; ảnh sản phẩm xoá cả bản R2 lẫn bản cũ (nếu có).
  log.length = 0;
  await storage.deleteObject(profile);
  assert.deepEqual(log.map(([op, bucket]) => `${op}:${bucket}`), ["r2.delete:veximtrade-media"]);
  log.length = 0;
  await storage.deleteObject(`products/${PROD}/${UUID}.webp`);
  assert.deepEqual(log.map(([op, bucket]) => `${op}:${bucket}`), ["r2.delete:veximtrade-private", "supabase.remove:vexim-media"]);
  await assert.rejects(storage.deleteObject(`product-form-images/${PROD}/${UUID}.webp`), /Không thể xóa/);
}

// 1b) R2 tạm lỗi khi đọc: ảnh cũ vẫn lấy từ Supabase.
{
  const broken = harness({ env: configured, supabaseFiles: { [`products/${PROD}/old.jpg`]: "old" } });
  // Kho R2 giả trả lỗi 503 cho mọi lần đọc.
  broken.r2.get = () => { throw Object.assign(new Error("socket hang up"), { $metadata: { httpStatusCode: 503 } }); };
  const out = await broken.storage.getObject(`products/${PROD}/old.jpg`);
  assert.equal(out.driver, "supabase", "An R2 outage does not break old photos");
}

// 2) Chưa tạo bucket riêng tư (hoặc đặt trùng bucket công khai): ảnh sản phẩm/A+ ở lại Supabase.
for (const env of [
  { R2_BUCKET_NAME: "veximtrade-media", R2_PUBLIC_URL: "https://media.veximtrade.com" },
  { ...configured, R2_PRIVATE_BUCKET_NAME: "veximtrade-media" },
]) {
  const { storage, r2 } = harness({ env });
  assert.equal((await storage.putObject(`products/${PROD}/${UUID}.webp`, bytes, "image/webp")).driver, "supabase");
  assert.equal((await storage.putObject(`aplus/${SUP}/${PROD}/${UUID}.webp`, bytes, "image/webp")).driver, "supabase");
  assert.equal(r2.size, 0, "Gated photos never land in the public bucket");
  // Ảnh hồ sơ vẫn dùng bucket công khai.
  await storage.putObject(storage.supplierProfileImagePath(SUP, "profile", UUID), bytes, "image/webp");
  assert.equal(r2.size, 1);
}

// 3) Chưa cấu hình R2: giữ nguyên hành vi cũ, tên tệp hồ sơ không mang dấu R2.
{
  const { storage, r2 } = harness({ env: { R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "" } });
  const path = storage.supplierProfileImagePath(SUP, "profile", UUID);
  assert.equal(path, `suppliers/${SUP}/profile-${UUID}.webp`);
  assert.equal((await storage.putObject(path, bytes, "image/webp")).driver, "supabase");
  assert.equal((await storage.putObject(`products/${PROD}/${UUID}.webp`, bytes, "image/webp")).driver, "supabase");
  assert.equal(r2.size, 0);
}

// 4) Endpoint R2 đúng định dạng Cloudflare.
{
  const { storage, log } = harness({ env: configured });
  await storage.putObject(`products/${PROD}/${UUID}.webp`, bytes, "image/webp");
  assert.deepEqual(log.find(([op]) => op === "s3.client"), ["s3.client", "https://acc.r2.cloudflarestorage.com", "auto"]);
}

// 5) Link hiển thị: chỉ ảnh hồ sơ trên R2 trỏ thẳng tới media.veximtrade.com.
{
  const original = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "https://media.veximtrade.com/";
  assert.equal(publicUrl.publicMediaUrl(`suppliers/${SUP}/profile-r2-${UUID}.webp`), `https://media.veximtrade.com/suppliers/${SUP}/profile-r2-${UUID}.webp`);
  assert.equal(publicUrl.publicMediaUrl(`/suppliers/${SUP}/cover-r2-${UUID}.webp`), `https://media.veximtrade.com/suppliers/${SUP}/cover-r2-${UUID}.webp`);
  assert.equal(publicUrl.publicMediaUrl(`suppliers/${SUP}/profile-${UUID}.jpg`), `/public-media/suppliers/${SUP}/profile-${UUID}.jpg`, "Old photos keep their link");
  assert.equal(publicUrl.publicMediaUrl(`products/${PROD}/${UUID}.webp`), `/public-media/products/${PROD}/${UUID}.webp`, "Product photos keep the access check");
  assert.equal(publicUrl.publicMediaUrl(`aplus/${SUP}/${PROD}/${UUID}.webp`), `/public-media/aplus/${SUP}/${PROD}/${UUID}.webp`);
  assert.equal(publicUrl.absolutePublicMediaUrl(`suppliers/${SUP}/profile-r2-${UUID}.webp`, "https://www.veximtrade.com"), `https://media.veximtrade.com/suppliers/${SUP}/profile-r2-${UUID}.webp`);
  assert.equal(publicUrl.absolutePublicMediaUrl(`suppliers/${SUP}/profile-${UUID}.jpg`, "https://www.veximtrade.com"), `https://www.veximtrade.com/public-media/suppliers/${SUP}/profile-${UUID}.jpg`);
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "";
  assert.equal(publicUrl.publicMediaUrl(`suppliers/${SUP}/profile-r2-${UUID}.webp`), `/public-media/suppliers/${SUP}/profile-r2-${UUID}.webp`, "Without the public URL, the gate route still serves R2 files");
  process.env.NEXT_PUBLIC_R2_PUBLIC_URL = "javascript:alert(1)";
  assert.equal(publicUrl.publicMediaUrl(`suppliers/${SUP}/profile-r2-${UUID}.webp`), `/public-media/suppliers/${SUP}/profile-r2-${UUID}.webp`);
  if (original === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_URL; else process.env.NEXT_PUBLIC_R2_PUBLIC_URL = original;
}

// 6) Nén ảnh hồ sơ: WebP, thu nhỏ, xoay theo EXIF, bỏ metadata, giữ nền trong suốt.
{
  const photo = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 30, g: 90, b: 160 } } })
    .jpeg({ quality: 95 }).withMetadata({ orientation: 6, exif: { IFD0: { Copyright: "secret-gps" } } }).toBuffer();
  const out = await prepareSupplierProfileImage(new Uint8Array(photo), "profile");
  const meta = await sharp(Buffer.from(out.data)).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width <= 800 && meta.height <= 800, "Profile photos are resized to at most 800px");
  assert.ok(out.height > out.width, "EXIF orientation is applied (portrait photo stays portrait)");
  assert.equal(meta.exif, undefined, "Metadata such as GPS is stripped");
  assert.ok(out.data.length < photo.length, "The WebP file is smaller than the original");

  const logo = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
  const logoOut = await sharp(Buffer.from((await prepareSupplierProfileImage(new Uint8Array(logo), "profile")).data)).metadata();
  assert.equal(logoOut.hasAlpha, true, "Transparent logos keep their transparency");
  assert.equal(logoOut.width, 400, "Small images are not enlarged");

  const cover = await prepareSupplierProfileImage(new Uint8Array(await sharp({ create: { width: 6000, height: 2000, channels: 3, background: "#ffffff" } }).png().toBuffer()), "cover");
  assert.equal(cover.width, 2400, "Covers are resized to at most 2400px wide");
  await assert.rejects(prepareSupplierProfileImage(new Uint8Array([0xff, 0xd8, 0xff, 0x00, 1, 2, 3]), "profile"));
}

// 7) Cả hai route tải ảnh hồ sơ đều nén WebP và dùng tên tệp R2; next.config cho phép tên miền R2.
for (const route of ["../app/api/supplier-portal/profile-image/route.ts", "../app/api/suppliers/[id]/profile-image/route.ts"]) {
  const source = read(route);
  assert.match(source, /prepareSupplierProfileImage\(bytes, kind\)/, `${route} converts to WebP`);
  assert.match(source, /supplierProfileImagePath\(/, `${route} uses the R2 file name`);
  assert.match(source, /putObject\(path, prepared\.data, "image\/webp"\)/, `${route} stores the WebP file`);
  assert.match(source, /url: publicMediaUrl\(path\)/, `${route} returns the public URL`);
}
const nextConfig = read("../next.config.ts");
assert.match(nextConfig, /hostname: "media\.veximtrade\.com", pathname: "\/suppliers\/\*\*"/);
assert.match(nextConfig, /NEXT_PUBLIC_R2_PUBLIC_URL: R2_PUBLIC_URL/);

console.log("✅ R2 media: profile photos on the public bucket as WebP, product/A+ photos only on the private bucket behind the access check, old Supabase photos still load.");
