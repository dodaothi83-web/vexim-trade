import "server-only";

import crypto from "node:crypto";

import { getAuthSecret } from "@/lib/auth/secret";

/**
 * Challenge chống bot TỰ CHỦ (thay Cloudflare Turnstile) — proof-of-work + chữ ký
 * HMAC, không gọi ra dịch vụ bên ngoài nào:
 *
 *   1. Server phát challenge: "<salt>.<issuedMs>.<difficulty>.<hmac>".
 *      HMAC ký trên purpose + salt + issuedMs + difficulty nên client không tự
 *      chế challenge dễ hơn, và challenge của form này không dùng được cho
 *      form khác (purpose buộc khớp).
 *   2. Trình duyệt brute-force tìm nonce sao cho SHA-256("<salt>:<nonce>")
 *      có đủ số 0 hex đầu theo difficulty (mặc định 4 → trung bình ~65 nghìn
 *      lần băm ≈ 1 giây ở máy phổ thông, chạy NGẦM trong lúc người dùng gõ,
 *      không cản trở ai cả — và vì không có request ra ngoài nên mạng chặn
 *      kiểu chặn challenges.cloudflare.com không còn tác dụng).
 *   3. Submit mang "<challenge>.<nonce>"; server kiểm tra chữ ký + hạn dùng +
 *      kết quả băm (một lần băm duy nhất, rẻ) và đánh dấu salt đã tiêu.
 *
 * Chống replay: salt đã dùng bị từ chối ở lần sau (best-effort trong RAM tiến
 * trình; serverless nhiều máy có thể lọt — rate limit theo IP/tài khoản ở
 * abuse-protection vẫn là lớp chặn khối lượng).
 *
 * Khoá ký: HKDF suy từ AUTH_SECRET (có sẵn cho cookie phiên), hoặc
 * CHALLENGE_SECRET nếu muốn tách khoá riêng.
 *
 * Công tắc khẩn cấp: CHALLENGE_DISABLED=true tắt toàn bộ (phát + xác minh đều
 * qua) — chỉ dùng khi có sự cố, nhớ xoá biến để bật lại.
 */

export type ChallengePurpose = "login" | "supplier-signup" | "admin-setup" | "service-inquiry" | "rfq";

export const CHALLENGE_PURPOSES: readonly ChallengePurpose[] = [
  "login", "supplier-signup", "admin-setup", "service-inquiry", "rfq",
];

export type FormChallengeCheck =
  | { ok: true }
  | { ok: false; reason: "missing" | "malformed" | "signature" | "expired" | "replayed" | "unsolved" };

const HKDF_SALT = "vexim-trade/form-challenge/v1";
const HKDF_INFO = "vxt_form_challenge hmac-sha256";
const DEFAULT_DIFFICULTY = 4;
const MAX_DIFFICULTY = 6;
const MIN_DIFFICULTY = 1;
const DEFAULT_MAX_AGE_MS = 15 * 60_000;
const MAX_NONCE = 999_999_999;
/** Dung sai nonce để giới hạn công việc server: một lần băm là đủ. */
const NONCE_RE = /^\d{1,9}$/;
/** Số salt đã tiêu tối đa giữ trong RAM; vượt thì dọn cũ nhất. */
const CONSUMED_CAP = 20_000;

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  if (!cachedKey) {
    const material = process.env.CHALLENGE_SECRET?.trim() || getAuthSecret();
    cachedKey = Buffer.from(
      crypto.hkdfSync("sha256", Buffer.from(material, "utf8"), Buffer.from(HKDF_SALT), Buffer.from(HKDF_INFO), 32),
    );
  }
  return cachedKey;
}

function hmac(message: string): string {
  return crypto.createHmac("sha256", signingKey()).update(message).digest("hex").slice(0, 32);
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

/** Công tắc tạm: CHALLENGE_DISABLED=true → phát + xác minh đều bỏ qua. */
export function isFormChallengeDisabled(): boolean {
  return process.env.CHALLENGE_DISABLED?.trim().toLowerCase() === "true";
}

/** Số số 0 hex đầu hash; mặc định 4 (16 bit ≈ 65k lần băm trung bình). */
export function formChallengeDifficulty(): number {
  const parsed = Number.parseInt(process.env.CHALLENGE_DIFFICULTY?.trim() ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_DIFFICULTY;
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, parsed));
}

function hmacMessage(purpose: ChallengePurpose, salt: string, issuedMs: number, difficulty: number): string {
  return `vexim:form-challenge:v1|${purpose}|${salt}|${issuedMs}|${difficulty}`;
}

export function issueFormChallenge(purpose: ChallengePurpose): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const issuedMs = Date.now();
  const difficulty = formChallengeDifficulty();
  return `${salt}.${issuedMs}.${difficulty}.${hmac(hmacMessage(purpose, salt, issuedMs, difficulty))}`;
}

function powHex(salt: string, nonce: string): string {
  return crypto.createHash("sha256").update(`${salt}:${nonce}`).digest("hex");
}

/* ------------------ Salt đã tiêu (chống replay, best-effort) ------------------ */

const consumed = new Map<string, number>();

function markConsumed(salt: string, expiresAt: number): void {
  if (consumed.size >= CONSUMED_CAP) {
    const now = Date.now();
    // Ưu tiên xoá các salt đã hết hạn giữ chỗ; vẫn còn chật thì xoá theo thứ tự
    // chèn (Map giữ thứ tự) — bỏ sót replay cũ nhất là chấp nhận được.
    for (const [key, at] of consumed) {
      if (at <= now) consumed.delete(key);
    }
    for (const key of consumed.keys()) {
      if (consumed.size < CONSUMED_CAP) break;
      consumed.delete(key);
    }
  }
  consumed.set(salt, expiresAt);
}

/**
 * Xác minh token do form gửi lên: "<salt>.<issuedMs>.<difficulty>.<hmac>.<nonce>".
 * Thuần cục bộ, không network — không còn trạng thái "unavailable" như hồi
 * dựa Cloudflare.
 */
export function verifyFormChallenge({
  purpose,
  token,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  nowMs = Date.now(),
}: {
  purpose: ChallengePurpose;
  token: string | null | undefined;
  maxAgeMs?: number;
  nowMs?: number;
}): FormChallengeCheck {
  if (isFormChallengeDisabled()) return { ok: true };
  const clean = (token ?? "").trim();
  if (!clean) return { ok: false, reason: "missing" };
  if (clean.length > 512) return { ok: false, reason: "malformed" };

  const parts = clean.split(".");
  if (parts.length !== 5) return { ok: false, reason: "malformed" };
  const [salt, issuedRaw, difficultyRaw, mac, nonce] = parts;
  if (!/^[0-9a-f]{16,64}$/.test(salt)) return { ok: false, reason: "malformed" };
  if (!/^\d{1,15}$/.test(issuedRaw) || !/^\d$/.test(difficultyRaw)) return { ok: false, reason: "malformed" };
  if (!NONCE_RE.test(nonce) || Number(nonce) > MAX_NONCE) return { ok: false, reason: "malformed" };
  const issuedMs = Number(issuedRaw);
  const difficulty = Number(difficultyRaw);
  if (difficulty < MIN_DIFFICULTY || difficulty > MAX_DIFFICULTY) return { ok: false, reason: "malformed" };

  if (!safeEqual(mac, hmac(hmacMessage(purpose, salt, issuedMs, difficulty)))) {
    return { ok: false, reason: "signature" };
  }
  if (nowMs < issuedMs - 60_000) return { ok: false, reason: "malformed" };
  if (nowMs - issuedMs > maxAgeMs) return { ok: false, reason: "expired" };
  if (consumed.has(salt)) return { ok: false, reason: "replayed" };

  if (!powHex(salt, nonce).startsWith("0".repeat(difficulty))) {
    return { ok: false, reason: "unsolved" };
  }
  markConsumed(salt, issuedMs + maxAgeMs);
  return { ok: true };
}

/** Đơn giản hoà cho các nơi chỉ cần boolean (spam score của RFQ). */
export async function verifyFormChallengeOk(purpose: ChallengePurpose, token: string | null | undefined): Promise<boolean> {
  return verifyFormChallenge({ purpose, token }).ok;
}
