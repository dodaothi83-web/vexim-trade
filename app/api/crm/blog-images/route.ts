import { createHmac, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth/session";
import { getAuthSecret } from "@/lib/auth/secret";
import { getStore } from "@/lib/db";
import { getSupabaseClient } from "@/lib/db/supabase";
import { optimizeBlogImage } from "@/lib/media/blog-image";
import { getObject, mediaBucket, putObject } from "@/lib/media/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

const MAX_BATCH = 10;
const CONCURRENCY = 2;
/** Ảnh cũ chưa chuyển: PNG/JPG tải lên trước khi có bước nén (tên tệp là uuid). */
const LEGACY_BLOG_IMAGE = /\/blog-media\/(blog\/([a-f0-9-]{36})\.(?:png|jpe?g))/gi;

/** Mã xác nhận theo người và theo ngày: link chạy chỉ dùng được khi lấy từ báo cáo dry-run hôm nay. */
function confirmToken(uid: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHmac("sha256", getAuthSecret()).update(`blog-images:${uid}:${day}`).digest("hex").slice(0, 24);
}

function tokenMatches(uid: string, value: string | null): boolean {
  const expected = Buffer.from(confirmToken(uid));
  const given = Buffer.from(value ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Job = { source: string; target: string; posts: string[]; bytes: number | null; done: boolean; webpBytes: number | null };

/** Kích thước các tệp trong thư mục blog/ (một lần gọi danh sách, không tải tệp). */
async function blogObjectSizes(): Promise<Map<string, number>> {
  const db = getSupabaseClient();
  if (!db) throw new Error("Chưa kết nối Supabase.");
  const sizes = new Map<string, number>();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.storage.from(mediaBucket()).list("blog", { limit: 1000, offset });
    if (error) throw new Error(`Không đọc được thư mục blog/: ${error.message}`);
    for (const item of data ?? []) sizes.set(`blog/${item.name}`, Number((item.metadata as { size?: number } | null)?.size ?? 0));
    if ((data ?? []).length < 1000) break;
  }
  return sizes;
}

async function plan(): Promise<Job[]> {
  const [posts, sizes] = await Promise.all([getStore().listPosts(), blogObjectSizes()]);
  const jobs = new Map<string, Job>();
  for (const post of posts) {
    const text = `${post.featured_image ?? ""}\n${post.content ?? ""}`;
    for (const match of text.matchAll(LEGACY_BLOG_IMAGE)) {
      const source = match[1].toLowerCase().startsWith("blog/") ? match[1] : `blog/${match[1]}`;
      const target = `blog/${match[2].toLowerCase()}.webp`;
      const job = jobs.get(source) ?? { source, target, posts: [], bytes: sizes.get(source) ?? null,
        done: sizes.has(target), webpBytes: sizes.get(target) ?? null };
      if (!job.posts.includes(post.slug)) job.posts.push(post.slug);
      jobs.set(source, job);
    }
  }
  return [...jobs.values()].sort((a, b) => a.source.localeCompare(b.source));
}

/**
 * Chỉ Quản trị: chuyển ảnh blog cũ (PNG/JPG nguyên bản) sang WebP ≤1600px.
 *
 *  - Không tham số: báo cáo dry-run (không ghi gì), kèm link chạy một đợt.
 *  - `?run=1&limit=10&confirm=<mã trong báo cáo>`: chuyển tối đa 10 ảnh chưa có bản WebP và lưu
 *    cạnh ảnh gốc với cùng uuid (`blog/<uuid>.webp`). Gọi lại tới khi `remaining` = 0.
 *
 * Route này KHÔNG sửa bài viết và không xoá ảnh gốc. Đổi link trong bài làm bằng một lệnh SQL
 * riêng sau khi đủ bản WebP, để giữ nguyên ngày cập nhật của bài (trigger posts_set_updated_at
 * luôn ghi NOW() khi app sửa bài).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return json({ error: "auth" }, 401);
  const url = new URL(request.url);
  let jobs: Job[];
  try { jobs = await plan(); }
  catch (error) { return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 503); }
  const pending = jobs.filter((job) => !job.done);
  const limit = Math.min(MAX_BATCH, Math.max(1, Number(url.searchParams.get("limit")) || MAX_BATCH));
  const runUrl = `${url.origin}${url.pathname}?run=1&limit=${limit}&confirm=${confirmToken(session.uid)}`;
  const sum = (list: Job[], key: "bytes" | "webpBytes") => list.reduce((total, job) => total + (job[key] ?? 0), 0);

  if (url.searchParams.get("run") !== "1") {
    return json({
      ok: true, mode: "dry-run",
      images: { total: jobs.length, pending: pending.length, converted: jobs.length - pending.length,
        pendingBytes: sum(pending, "bytes"), posts: new Set(jobs.flatMap((job) => job.posts)).size },
      list: jobs.map((job) => ({ source: job.source, bytes: job.bytes, posts: job.posts, converted: job.done, webpBytes: job.webpBytes })),
      next: pending.length ? { runBatch: runUrl } : null,
    });
  }

  if (!tokenMatches(session.uid, url.searchParams.get("confirm"))) {
    return json({ ok: false, error: "Mã xác nhận sai hoặc đã sang ngày mới. Mở lại báo cáo dry-run để lấy link." }, 403);
  }

  const batch = pending.slice(0, limit);
  const results: { source: string; target: string; ok: boolean; before?: number; after?: number; error?: string; ms: number }[] = [];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, async () => {
    while (cursor < batch.length) {
      const job = batch[cursor++];
      const start = Date.now();
      try {
        const original = await getObject(job.source);
        if (!original) throw new Error(`Không đọc được ảnh gốc ${job.source}`);
        const image = await optimizeBlogImage(original.data, /\.png$/i.test(job.source) ? "image/png" : "image/jpeg");
        if (image.mime !== "image/webp") throw new Error("Ảnh không chuyển được sang WebP.");
        await putObject(job.target, image.data, "image/webp");
        results.push({ source: job.source, target: job.target, ok: true, before: original.data.byteLength, after: image.data.byteLength, ms: Date.now() - start });
      } catch (error) {
        results.push({ source: job.source, target: job.target, ok: false, error: (error instanceof Error ? error.message : String(error)).slice(0, 300), ms: Date.now() - start });
      }
    }
  }));
  const converted = results.filter((r) => r.ok).length;
  const remaining = pending.length - converted;
  return json({
    ok: results.every((r) => r.ok), mode: "run", converted, failed: results.length - converted, remaining,
    bytesBefore: results.reduce((total, r) => total + (r.before ?? 0), 0),
    bytesAfter: results.reduce((total, r) => total + (r.after ?? 0), 0),
    results,
    next: remaining > 0 ? { runBatch: runUrl } : null,
  });
}
