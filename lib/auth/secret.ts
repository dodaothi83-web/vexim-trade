import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Khoá ký cookie phiên đăng nhập.
 *
 * Thứ tự ưu tiên:
 *  1. Biến môi trường AUTH_SECRET  → chuẩn nhất, dùng cho mọi môi trường.
 *  2. File data/auth-secret        → tiện khi chạy ở máy có ổ đĩa ghi được.
 *  3. Suy ra từ khoá Supabase      → dùng khi KHÔNG ghi được file (Vercel,
 *     serverless, ổ đĩa chỉ đọc): mọi tiến trình đều suy ra CÙNG một khoá nên
 *     phiên không bị mất khi request rơi vào máy chủ khác.
 *  4. Khoá ngẫu nhiên trong RAM    → phương án cuối, phiên sẽ mất khi tải lại.
 *
 * Vì sao phải có bước 3: trước đây khi không ghi được file, app sinh khoá ngẫu
 * nhiên cho từng tiến trình. Trên Vercel mỗi request có thể vào một máy chủ khác
 * nhau, nên cookie do máy A ký sẽ bị máy B coi là sai chữ ký → người dùng bị đá
 * về /login ngay sau khi đăng nhập (mà không kèm lời giải thích nào).
 */
const FILE = path.join(process.cwd(), "data", "auth-secret");
const HKDF_SALT = "vexim-trade/session-cookie/v1";
const HKDF_INFO = "vxt_session hmac-sha256";

let cached: string | null = null;

/** Suy khoá ký phiên từ một khoá bí mật đã có (HKDF-SHA256, không dùng trực tiếp). */
function deriveFrom(material: string): string {
  return Buffer.from(
    crypto.hkdfSync("sha256", Buffer.from(material, "utf8"), Buffer.from(HKDF_SALT), Buffer.from(HKDF_INFO), 32),
  ).toString("hex");
}

/** Vật liệu dự phòng: khoá Supabase mà máy chủ đã có sẵn. */
function fallbackMaterial(): { material: string; from: string } | null {
  const candidates: Array<[string, string | undefined]> = [
    ["SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY],
    ["SUPABASE_JWT_SECRET", process.env.SUPABASE_JWT_SECRET],
    ["SUPABASE_ANON_KEY", process.env.SUPABASE_ANON_KEY],
  ];
  for (const [name, value] of candidates) {
    const v = value?.trim();
    if (v && v.length >= 16) return { material: v, from: name };
  }
  return null;
}

export function getAuthSecret(): string {
  if (cached) return cached;

  const fromEnv = process.env.AUTH_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) {
    cached = fromEnv;
    return cached;
  }

  try {
    if (fs.existsSync(FILE)) {
      const saved = fs.readFileSync(FILE, "utf8").trim();
      if (saved.length >= 16) {
        cached = saved;
        return cached;
      }
    }
    const generated = crypto.randomBytes(48).toString("hex");
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, generated, { encoding: "utf8", mode: 0o600 });
    console.warn(
      "[auth] Chưa có AUTH_SECRET — đã sinh khoá ở data/auth-secret (chỉ hợp khi máy chủ có ổ đĩa ghi được).\n" +
        "       Khi chạy production (đặc biệt trên Vercel) hãy đặt AUTH_SECRET trong biến môi trường.",
    );
    cached = generated;
    return cached;
  } catch {
    // Không ghi được file (serverless / chỉ đọc) → dùng khoá suy ra, ổn định giữa các máy chủ
  }

  const fallback = fallbackMaterial();
  if (fallback) {
    console.error(
      `[auth] THIẾU AUTH_SECRET và không ghi được data/auth-secret. Đang suy khoá ký phiên từ ${fallback.from}.\n` +
        "       Phiên vẫn hoạt động nhưng hãy đặt AUTH_SECRET trong biến môi trường của máy chủ để đúng chuẩn\n" +
        "       (node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\").",
    );
    cached = deriveFrom(fallback.material);
    return cached;
  }

  console.error(
    "[auth] NGHIÊM TRỌNG: không có AUTH_SECRET, không ghi được file, không có khoá Supabase để suy ra.\n" +
      "       Phiên đăng nhập sẽ mất sau mỗi lần khởi động lại hoặc khi request sang máy chủ khác.",
  );
  cached = crypto.randomBytes(48).toString("hex");
  return cached;
}
