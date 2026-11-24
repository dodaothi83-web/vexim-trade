import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { r2Delete, r2PresignPut, r2PrivateBucket, r2PublicBucket, r2Put, r2Size } from "@/lib/media/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

type Step = { ok: true; ms: number; detail?: string } | { ok: false; ms: number; error: string };

function describe(error: unknown): string {
  const e = error as { name?: string; Code?: string; message?: string; $metadata?: { httpStatusCode?: number } };
  return [e?.$metadata?.httpStatusCode, e?.Code ?? e?.name, e?.message].filter(Boolean).join(" ").slice(0, 300);
}

async function step(run: () => Promise<string | void>): Promise<Step> {
  const start = Date.now();
  try {
    const detail = await run();
    return { ok: true, ms: Date.now() - start, ...(detail ? { detail } : {}) };
  } catch (error) {
    return { ok: false, ms: Date.now() - start, error: describe(error) };
  }
}

async function sizeOf(bucket: string, key: string): Promise<string> {
  const size = await r2Size(bucket, key);
  if (size === null) throw new Error("404 không tìm thấy tệp");
  return `${size} bytes`;
}

/** Ghi, đọc, xoá một tệp thử rất nhỏ; tệp thử luôn được xoá (nếu ghi được). */
async function probe(bucket: string, prefix: string) {
  const key = `${prefix}/_healthcheck/${Date.now()}-${randomUUID()}.txt`;
  const data = new TextEncoder().encode("vexim storage check");
  const put = await step(() => r2Put(bucket, key, data, "text/plain"));
  const head = put.ok ? await step(() => sizeOf(bucket, key)) : null;
  const remove = put.ok ? await step(() => r2Delete(bucket, key)) : null;
  return { key, put, head, delete: remove };
}

/** Tải lên bằng link có chữ ký, gọi từ máy chủ: thử chữ ký và quyền mà không vướng CORS của trình duyệt. */
async function presignProbe(bucket: string) {
  const key = `chat/_healthcheck/${Date.now()}-${randomUUID()}.txt`;
  const put = await step(async () => {
    const url = await r2PresignPut(bucket, key, "text/plain", 120);
    const res = await fetch(url, { method: "PUT", headers: { "Content-Type": "text/plain" }, body: "vexim presign check" });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).replace(/\s+/g, " ").slice(0, 240)}`);
    return `${res.status}`;
  });
  const remove = put.ok ? await step(() => r2Delete(bucket, key)) : null;
  return { key, put, delete: remove };
}

/** Độ dài và dạng của một khoá, không trả nội dung khoá. */
function shape(value: string | undefined, expected: number) {
  const raw = value ?? "";
  const v = raw.trim();
  const hex = /^[0-9a-f]+$/i.test(v);
  return {
    length: v.length,
    expected,
    hex,
    looksRight: v.length === expected && hex,
    ...(raw !== v ? { note: "có khoảng trắng hoặc xuống dòng ở đầu/cuối (đã tự bỏ)" } : {}),
    ...(/["'\s]/.test(v) ? { warning: "có dấu nháy hoặc khoảng trắng bên trong" } : {}),
  };
}

function mask(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  return v.length <= 8 ? `${v.slice(0, 2)}…` : `${v.slice(0, 4)}…${v.slice(-4)}`;
}

/**
 * Chỉ Quản trị: kiểm nhanh quyền của khoá R2 trên từng bucket (ghi, đọc, xoá, link có chữ ký),
 * để biết lỗi tải tệp (ví dụ 403 AccessDenied) nằm ở khoá, bucket hay ở mã nguồn.
 * `?key=products/...` thử thêm việc đọc một tệp có sẵn trên bucket riêng tư.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "admin") return json({ error: "auth" }, 401);
  const privateBucket = r2PrivateBucket();
  const publicBucket = r2PublicBucket();
  const existing = new URL(request.url).searchParams.get("key");
  const endpoint = (process.env.R2_ENDPOINT ?? "").trim() || `https://${mask(process.env.R2_ACCOUNT_ID)}.r2.cloudflarestorage.com`;

  return json({
    config: {
      endpoint,
      accessKeyId: mask(process.env.R2_ACCESS_KEY_ID),
      // Không lộ khoá: chỉ độ dài và dạng. Khoá R2 đúng: Access Key ID 32 ký tự hex, Secret 64 ký tự hex.
      accessKeyShape: shape(process.env.R2_ACCESS_KEY_ID, 32),
      secretShape: shape(process.env.R2_SECRET_ACCESS_KEY, 64),
      privateBucket: privateBucket ?? `(chưa cấu hình: "${(process.env.R2_PRIVATE_BUCKET_NAME ?? "").trim()}")`,
      publicBucket: publicBucket ?? "(chưa cấu hình)",
    },
    private: privateBucket ? {
      products: await probe(privateBucket, "products"),
      chat: await probe(privateBucket, "chat"),
      presignedPut: await presignProbe(privateBucket),
      ...(existing && /^(products|aplus|chat)\//.test(existing) ? { readExisting: await step(() => sizeOf(privateBucket, existing)) } : {}),
    } : null,
    public: publicBucket ? { healthcheck: await probe(publicBucket, "system") } : null,
  });
}
