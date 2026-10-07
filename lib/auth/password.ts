import "server-only";

import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

/**
 * Mật khẩu nội bộ (dùng khi app không kết nối được Supabase Auth).
 * Băm bằng scrypt + salt riêng cho từng tài khoản, định dạng:
 *   scrypt$<saltHex>$<hashHex>
 */
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  try {
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    const actual = await scrypt(password, salt, expected.length);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** Quy tắc mật khẩu tối thiểu cho tài khoản nội bộ */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Mật khẩu cần ít nhất 8 ký tự.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "Mật khẩu cần có cả chữ và số.";
  }
  return null;
}
