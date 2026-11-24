import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getAuthSecret } from "@/lib/auth/secret";
import { getSupabaseClient } from "@/lib/db/supabase";
import { cdnOwnerOf, publishMediaToCdn, publishSupplierImageToCdn, supplierImageNeedsCdn } from "@/lib/media/cdn";
import { supplierImageCdnBase, type SupplierImageFields, type SupplierImageKind } from "@/lib/media/public-image-path";
import { r2PublicBucket } from "@/lib/media/r2";
import type { MediaAsset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const MAX_BATCH = 50;
const CONCURRENCY = 4;
const COLUMNS = "id, owner_type, product_id, supplier_id, verification_id, submission_id, checklist_key, kind, audience, status, expires_on, caption, storage_path, thumb_path, external_url, mime, bytes, width, height, sort_order, created_by, created_at, updated_at, cdn_key";

/** Mã xác nhận theo người và theo ngày: link chép chỉ chạy khi lấy từ báo cáo dry-run hôm nay. */
function confirmToken(uid: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", getAuthSecret()).update(`media-cdn:${uid}:${day}`).digest("hex").slice(0, 24);
}

function tokenMatches(uid: string, value: string | null): boolean {
  const expected = Buffer.from(confirmToken(uid));
  const given = Buffer.from(value ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readBuyerImages(): Promise<MediaAsset[]> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Chưa kết nối Supabase.");
  const rows: MediaAsset[] = [];
  let after: string | null = null;
  for (;;) {
    let query = db.from("media_assets").select(COLUMNS)
      .eq("kind", "image").eq("audience", "buyer").in("owner_type", ["product", "supplier"])
      .order("id", { ascending: true }).limit(500);
    if (after) query = query.gt("id", after);
    const { data, error } = await query;
    if (error) {
      if (/cdn_key/.test(error.message)) throw new Error("Chưa chạy migration 20261229_media_cdn_key.sql (thiếu cột cdn_key).");
      throw new Error(`Không đọc được media_assets: ${error.message}`);
    }
    const page = (data ?? []) as unknown as MediaAsset[];
    rows.push(...page);
    if (page.length < 500) break;
    after = page[page.length - 1].id;
  }
  return rows;
}

const SUPPLIER_COLUMNS = "id, profile_image, cover_image, profile_image_cdn_key, cover_image_cdn_key";

/** Ảnh đại diện/ảnh bìa lưu ở bảng suppliers (không có dòng media_assets). */
async function readSupplierImages(): Promise<SupplierImageFields[]> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Chưa kết nối Supabase.");
  const { data, error } = await db.from("suppliers").select(SUPPLIER_COLUMNS)
    .or("profile_image.not.is.null,cover_image.not.is.null").order("id", { ascending: true }).limit(5000);
  if (error) {
    if (/cdn_key/.test(error.message)) throw new Error("Chưa chạy migration 20261230_supplier_image_cdn_key.sql (thiếu cột profile_image_cdn_key/cover_image_cdn_key).");
    throw new Error(`Không đọc được suppliers: ${error.message}`);
  }
  return (data ?? []) as unknown as SupplierImageFields[];
}

type SupplierImageJob = { supplier: SupplierImageFields; kind: SupplierImageKind; path: string };
type SupplierPlan = { pending: SupplierImageJob[]; done: SupplierImageJob[]; skipped: { id: string; kind: SupplierImageKind; reason: string; path: string }[] };

function planSupplierImages(rows: SupplierImageFields[]): SupplierPlan {
  const result: SupplierPlan = { pending: [], done: [], skipped: [] };
  for (const supplier of rows) {
    for (const kind of ["profile", "cover"] as const) {
      const path = kind === "cover" ? supplier.cover_image : supplier.profile_image;
      if (!path) continue;
      const job = { supplier, kind, path };
      if (supplierImageNeedsCdn(supplier, kind)) result.pending.push(job);
      else if (supplierImageCdnBase(supplier.id, path, kind)) result.done.push(job);
      else result.skipped.push({ id: supplier.id, kind, path, reason: /-r2-/.test(path)
        ? "đã nằm ở bucket công khai (ảnh tải lên sau khi có R2)" : "không phải ảnh trong thư mục của nhà cung cấp" });
    }
  }
  return result;
}

function supplierSummary(p: SupplierPlan) {
  const count = (list: { kind: SupplierImageKind }[], kind: SupplierImageKind) => list.filter((j) => j.kind === kind).length;
  return {
    pending: { total: p.pending.length, profile: count(p.pending, "profile"), cover: count(p.pending, "cover") },
    alreadyOnCdn: { total: p.done.length, profile: count(p.done, "profile"), cover: count(p.done, "cover") },
    skipped: p.skipped,
  };
}

type Plan = { pending: MediaAsset[]; done: MediaAsset[]; skipped: { id: string; reason: string; path: string | null }[] };

function plan(rows: MediaAsset[]): Plan {
  const result: Plan = { pending: [], done: [], skipped: [] };
  for (const asset of rows) {
    if (asset.cdn_key) { result.done.push(asset); continue; }
    if (cdnOwnerOf(asset)) { result.pending.push(asset); continue; }
    const reason = asset.product_id?.startsWith("ed3a38eb") ? "sản phẩm thử nghiệm ed3a38eb"
      : asset.expires_on && new Date(asset.expires_on) < new Date() ? "đã hết hạn"
      : "ngoài thư mục ảnh công khai (kho ảnh, ảnh đại diện/bìa, A+…)";
    result.skipped.push({ id: asset.id, reason, path: asset.storage_path });
  }
  return result;
}

function summary(p: Plan) {
  const count = (list: MediaAsset[], owner: "product" | "supplier") => list.filter((a) => a.owner_type === owner).length;
  const bytes = (list: MediaAsset[]) => list.reduce((sum, a) => sum + (a.bytes ?? 0), 0);
  return {
    pending: { total: p.pending.length, productImages: count(p.pending, "product"), factoryImages: count(p.pending, "supplier"),
      originalBytes: bytes(p.pending), products: new Set(p.pending.map((a) => a.product_id).filter(Boolean)).size },
    alreadyOnCdn: { total: p.done.length, productImages: count(p.done, "product"), factoryImages: count(p.done, "supplier") },
    skipped: { total: p.skipped.length, byReason: p.skipped.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {}) },
  };
}

/**
 * Chỉ Quản trị: chép ảnh sản phẩm, ảnh nhà máy công khai và ảnh đại diện/ảnh bìa cũ của nhà cung
 * cấp (bảng suppliers) lên CDN (bucket R2 công khai).
 *
 *  - Không tham số: báo cáo dry-run (không ghi gì), kèm link chạy một đợt.
 *  - `?run=1&limit=50&confirm=<mã trong báo cáo>`: chép tối đa 50 ảnh chưa có bản CDN rồi trả
 *    kết quả từng ảnh. Gọi lại tới khi `remaining` = 0. Chạy lại an toàn: ảnh đã có cdn_key bị bỏ qua.
 *
 * Bản gốc (storage_path/thumb_path) không bị đổi hay xoá. Trang chỉ dùng bản CDN khi bật
 * MEDIA_CDN_ENABLED=true, nên chép trước, kiểm tra, rồi mới bật cờ.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return json({ error: "auth" }, 401);
  const url = new URL(request.url);
  const bucket = r2PublicBucket();
  let rows: MediaAsset[];
  let supplierRows: SupplierImageFields[];
  try { [rows, supplierRows] = await Promise.all([readBuyerImages(), readSupplierImages()]); }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 503); }
  const current = plan(rows);
  const suppliers = planSupplierImages(supplierRows);
  const pendingTotal = current.pending.length + suppliers.pending.length;
  const token = confirmToken(session.uid);
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(url.searchParams.get("limit")) || MAX_BATCH));
  const runUrl = `${url.origin}${url.pathname}?run=1&limit=${limit}&confirm=${token}`;

  if (url.searchParams.get("run") !== "1") {
    return json({
      ok: true, mode: "dry-run", publicBucket: bucket ?? "(chưa cấu hình R2_BUCKET_NAME)",
      cdnReadEnabled: process.env.MEDIA_CDN_ENABLED === "true",
      ...summary(current),
      sample: current.pending.slice(0, 10).map((a) => ({ id: a.id, owner: a.owner_type, path: a.storage_path, bytes: a.bytes })),
      skippedList: current.skipped.slice(0, 50),
      // Ảnh đại diện/ảnh bìa ở bảng suppliers, chép sau ảnh sản phẩm/nhà máy trong cùng link chạy.
      supplierImages: {
        ...supplierSummary(suppliers),
        sample: suppliers.pending.slice(0, 10).map((j) => ({ supplierId: j.supplier.id, kind: j.kind, path: j.path })),
      },
      remainingTotal: pendingTotal,
      next: pendingTotal && bucket ? { runBatch: runUrl } : null,
    });
  }

  if (!tokenMatches(session.uid, url.searchParams.get("confirm"))) return json({ ok: false, error: "Mã xác nhận sai hoặc đã sang ngày mới. Mở lại báo cáo dry-run để lấy link." }, 403);
  if (!bucket) return json({ ok: false, error: "Chưa cấu hình bucket R2 công khai." }, 503);

  type Job = { id: string; kind?: SupplierImageKind; run: () => Promise<string | null> };
  const jobs: Job[] = [
    ...current.pending.map((asset) => ({ id: asset.id, run: async () => (await publishMediaToCdn(asset)).cdn_key ?? null })),
    ...suppliers.pending.map((j) => ({ id: j.supplier.id, kind: j.kind, run: () => publishSupplierImageToCdn(j.supplier, j.kind) })),
  ];
  const batch = jobs.slice(0, limit);
  const results: { id: string; kind?: SupplierImageKind; ok: boolean; cdnKey?: string | null; error?: string; ms: number }[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
    while (cursor < batch.length) {
      const job = batch[cursor++];
      const start = Date.now();
      try {
        const cdnKey = await job.run();
        results.push({ id: job.id, ...(job.kind ? { kind: job.kind } : {}), ok: true, cdnKey, ms: Date.now() - start });
      } catch (error) {
        results.push({ id: job.id, ...(job.kind ? { kind: job.kind } : {}), ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 300), ms: Date.now() - start });
      }
    }
  }));
  const copied = results.filter((r) => r.ok).length;
  const remaining = jobs.length - copied;
  return json({
    ok: results.every((r) => r.ok), mode: "run", copied, failed: results.length - copied, remaining,
    results,
    next: remaining > 0 ? { runBatch: runUrl } : null,
  });
}
