import "server-only";

import crypto from "node:crypto";

import { getStore } from "@/lib/db";
import { getAuthSecret } from "@/lib/auth/secret";

/**
 * Thư đăng nhập của người mua: một link VÀ một mã 6 số, dùng một lần, hạn 15 phút.
 *
 * Hai đường trong cùng một thư vì hai tình huống thật:
 *
 *  - máy quét link của công ty mở link trước người dùng → link chết, người dùng gõ mã;
 *  - mở thư trên điện thoại nhưng đăng nhập trên máy tính → gõ mã.
 *
 * Chỉ lưu BĂM của link và mã. Đọc được bảng `buyer_sign_in_tokens` cũng không đăng nhập được.
 */

export const SIGN_IN_TTL_MS = 15 * 60_000;
/** Quá số lần này thì token chết hẳn: 6 chữ số chỉ có một triệu khả năng. */
export const MAX_CODE_ATTEMPTS = 5;

/** Chuẩn hoá email về dạng dùng làm khoá: viết thường, bỏ khoảng trắng thừa. */
export function normalizeBuyerEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isDeliverableEmail(email: string): boolean {
  const clean = normalizeBuyerEmail(email);
  return clean.length <= 320 && EMAIL_PATTERN.test(clean);
}

function hashSecret(raw: string): string {
  return crypto.createHmac("sha256", getAuthSecret()).update(raw).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

/** Token cho link: 32 byte ngẫu nhiên, không đoán được, đủ ngắn để nằm vừa một URL. */
export function generateLinkToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Mã 6 số: `randomInt` của node dùng CSPRNG, khác `Math.random`. */
export function generateSignInCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

export interface IssuedSignIn {
  /** Chuỗi bí mật nhét vào link — không lưu, chỉ dùng để dựng URL. */
  linkToken: string;
  /** Mã 6 số — không lưu, chỉ in vào thư. */
  code: string;
  expiresAt: string;
}

/**
 * Phát một thư đăng nhập mới cho email. Thư cũ của cùng email chết ngay khi
 * thư mới được phát (store lo phần đó), nên không bao giờ có hai mã cùng sống.
 */
export async function issueSignInToken(email: string): Promise<IssuedSignIn> {
  const clean = normalizeBuyerEmail(email);
  const linkToken = generateLinkToken();
  const code = generateSignInCode();
  const expiresAt = new Date(Date.now() + SIGN_IN_TTL_MS).toISOString();
  await getStore().createBuyerSignInToken({
    email: clean,
    link_hash: hashSecret(linkToken),
    code_hash: hashSecret(`${clean}|${code}`),
    expires_at: expiresAt,
  });
  return { linkToken, code, expiresAt };
}

export function buyerSignInUrl(linkToken: string, nextPath?: string | null): string {
  const query = new URLSearchParams({ t: linkToken });
  if (nextPath) query.set("next", nextPath);
  return `/buyer/sign-in/verify?${query.toString()}`;
}

export type SignInFailure =
  | "invalid_email"
  | "no_token"
  | "expired"
  | "used"
  | "too_many_attempts"
  | "wrong_code";

export type SignInVerification =
  | { ok: true; email: string }
  | { ok: false; reason: SignInFailure };

/**
 * Đăng nhập bằng MÃ 6 SỐ.
 *
 * Sai mã thì tăng bộ đếm; chạm trần thì huỷ token của email đó, buộc phải xin thư mới.
 * Đúng mã thì tiêu token theo kiểu nguyên tử — hai lần bấm song song chỉ một lần vào được.
 */
export async function verifySignInCode(rawEmail: string, rawCode: string): Promise<SignInVerification> {
  const email = normalizeBuyerEmail(rawEmail);
  if (!isDeliverableEmail(email)) return { ok: false, reason: "invalid_email" };
  const code = rawCode.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, reason: "wrong_code" };

  const store = getStore();
  const token = await store.findBuyerSignInToken(email);
  // Không còn token sống: có thể đã dùng, đã hết hạn, hoặc chưa từng xin.
  if (!token) return { ok: false, reason: "no_token" };

  if (!safeEqual(token.code_hash, hashSecret(`${email}|${code}`))) {
    const attempts = await store.bumpBuyerSignInAttempts(token.id);
    if (attempts >= MAX_CODE_ATTEMPTS) {
      await store.deleteBuyerSignInTokens(email);
      return { ok: false, reason: "too_many_attempts" };
    }
    return { ok: false, reason: "wrong_code" };
  }

  const won = await store.consumeBuyerSignInToken(token.id);
  if (!won) return { ok: false, reason: "used" };
  return { ok: true, email };
}

/**
 * Đăng nhập bằng LINK trong thư.
 *
 * Link không biết email trước nên tra theo băm. Link đã dùng mà bấm lại phải nói rõ là
 * đã dùng, chứ không được coi là "link sai".
 */
export async function verifySignInLink(linkToken: string): Promise<SignInVerification> {
  if (!linkToken || linkToken.length > 200) return { ok: false, reason: "no_token" };
  const store = getStore();
  const token = await store.getBuyerSignInTokenByLinkHash(hashSecret(linkToken));
  if (!token) return { ok: false, reason: "no_token" };
  if (token.consumed_at) return { ok: false, reason: "used" };
  if (new Date(token.expires_at).getTime() <= Date.now()) return { ok: false, reason: "expired" };

  const won = await store.consumeBuyerSignInToken(token.id);
  if (!won) return { ok: false, reason: "used" };
  return { ok: true, email: token.email };
}
