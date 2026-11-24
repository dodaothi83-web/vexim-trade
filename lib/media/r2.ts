import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 (giao thức S3) cho ảnh mới.
 *
 * Hai bucket, tách theo quyền xem:
 *  - R2_BUCKET_NAME (veximtrade-media): gắn tên miền R2_PUBLIC_URL nên MỌI tệp trong đó đều
 *    công khai. Chứa ảnh đại diện/logo, ảnh bìa nhà cung cấp và bản sao WebP 400/1024/1600 của
 *    ảnh sản phẩm + ảnh nhà máy công khai (khoá ngẫu nhiên `p/…`, `s/…`, xem lib/media/cdn.ts).
 *  - R2_PRIVATE_BUCKET_NAME: không gắn tên miền. Chứa bản gốc ảnh sản phẩm, ảnh A+, tệp chat;
 *    buyer chỉ xem được qua /public-media hoặc link có chữ ký, nơi kiểm tra quyền như trước.
 *
 * Thiếu biến nào thì phần tương ứng tắt và ảnh tiếp tục lưu ở Supabase Storage như cũ.
 * Giấy tờ, chứng nhận, ảnh nội bộ và tệp chat không bao giờ vào bucket công khai.
 */

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function credentialsConfigured(): boolean {
  return Boolean(env("R2_ACCOUNT_ID") && env("R2_ACCESS_KEY_ID") && env("R2_SECRET_ACCESS_KEY"));
}

/** Bucket công khai (ảnh đại diện/ảnh bìa). Cần thêm R2_PUBLIC_URL để có đường dẫn trực tiếp. */
export function r2PublicBucket(): string | null {
  const bucket = env("R2_BUCKET_NAME");
  return credentialsConfigured() && bucket && env("R2_PUBLIC_URL") ? bucket : null;
}

let warnedSameBucket = false;

/** Bucket riêng tư (ảnh sản phẩm, A+). Trùng tên bucket công khai thì coi như chưa cấu hình. */
export function r2PrivateBucket(): string | null {
  const bucket = env("R2_PRIVATE_BUCKET_NAME");
  if (!credentialsConfigured() || !bucket) return null;
  if (bucket === env("R2_BUCKET_NAME")) {
    if (!warnedSameBucket) {
      warnedSameBucket = true;
      console.error("[r2] R2_PRIVATE_BUCKET_NAME trùng bucket công khai; ảnh sản phẩm/A+ tiếp tục lưu ở Supabase.");
    }
    return null;
  }
  return bucket;
}

const globalForR2 = globalThis as unknown as { __veximR2Client?: S3Client };

function client(): S3Client {
  if (!globalForR2.__veximR2Client) {
    globalForR2.__veximR2Client = new S3Client({
      region: "auto",
      // R2_ENDPOINT chỉ dùng khi thử với máy chủ S3 giả lập ở local.
      endpoint: env("R2_ENDPOINT") || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: Boolean(env("R2_ENDPOINT")),
      credentials: {
        accessKeyId: env("R2_ACCESS_KEY_ID"),
        secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
      },
      // Theo khuyến nghị của Cloudflare cho SDK v3 mới: chỉ gửi checksum khi API bắt buộc.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }
  return globalForR2.__veximR2Client;
}

function notFound(error: unknown): boolean {
  const e = error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
  return e?.name === "NoSuchKey" || e?.name === "NotFound" || e?.Code === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

export async function r2Put(bucket: string, key: string, data: Uint8Array, contentType: string, cacheControl?: string): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
    ...(cacheControl ? { CacheControl: cacheControl } : {}),
  }));
}

/** Ghi tệp mới, không ghi đè tệp đã có. */
export async function r2PutNew(bucket: string, key: string, data: Uint8Array, contentType: string): Promise<void> {
  if (await r2Exists(bucket, key)) throw new Error("Tệp đã tồn tại, không ghi đè.");
  await r2Put(bucket, key, data, contentType);
}

export async function r2Exists(bucket: string, key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (notFound(error)) return false;
    throw error;
  }
}

/** null khi tệp không có trong bucket; lỗi khác (mạng, quyền) vẫn được báo lên. */
export async function r2Get(bucket: string, key: string): Promise<Uint8Array | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    return await res.Body.transformToByteArray();
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}

export async function r2Delete(bucket: string, key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/**
 * Link tải lên một lần (PUT) cho trình duyệt, hết hạn sau `expiresSeconds`. Content-Type được ký
 * kèm nên trình duyệt phải gửi đúng loại đã khai. Bucket cần CORS cho phép PUT từ tên miền site
 * (docs/supplier-chat.md); chưa có thì trình duyệt tự chuyển sang tải qua máy chủ.
 */
export async function r2PresignPut(bucket: string, key: string, contentType: string, expiresSeconds = 600): Promise<string> {
  return getSignedUrl(client(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: expiresSeconds });
}

/** Link đọc có hạn ngắn; tên tệp và cách mở (xem ngay hay tải về) ghi vào tiêu đề trả về. */
export async function r2PresignGet(
  bucket: string,
  key: string,
  options: { contentType: string; disposition: string; expiresSeconds?: number },
): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentType: options.contentType,
    ResponseContentDisposition: options.disposition,
    ResponseCacheControl: "private, max-age=300",
  }), { expiresIn: options.expiresSeconds ?? 300 });
}

/** Dung lượng tệp trên R2 (null khi chưa có). */
export async function r2Size(bucket: string, key: string): Promise<number | null> {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return typeof res.ContentLength === "number" ? res.ContentLength : null;
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}

/** Đọc `bytes` byte đầu của tệp (kiểm tra nội dung thật mà không tải cả tệp). */
export async function r2GetHead(bucket: string, key: string, bytes: number): Promise<Uint8Array | null> {
  try {
    const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${Math.max(0, bytes - 1)}` }));
    if (!res.Body) return null;
    return await res.Body.transformToByteArray();
  } catch (error) {
    if (notFound(error)) return null;
    throw error;
  }
}
