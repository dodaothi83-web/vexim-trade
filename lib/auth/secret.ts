import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Khoá ký phiên đăng nhập.
 *
 * Ưu tiên biến môi trường AUTH_SECRET. Nếu chưa đặt (ví dụ chạy thử ở máy),
 * sinh một khoá ngẫu nhiên và lưu vào data/auth-secret (đã nằm trong .gitignore)
 * để phiên đăng nhập không bị mất khi khởi động lại app.
 */
const FILE = path.join(process.cwd(), "data", "auth-secret");

let cached: string | null = null;

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
      "[auth] Chưa có AUTH_SECRET — đã sinh khoá mới ở data/auth-secret.\n" +
        "       Khi chạy production hãy đặt AUTH_SECRET trong .env.local để phiên đăng nhập ổn định.",
    );
    cached = generated;
    return cached;
  } catch (err) {
    console.warn("[auth] Không đọc/ghi được data/auth-secret, dùng khoá tạm trong RAM:", err);
    cached = crypto.randomBytes(48).toString("hex");
    return cached;
  }
}
