import crypto from "node:crypto";

import { getAuthSecret } from "@/lib/auth/secret";

const HKDF_SALT = "vexim-trade/password-reset/v1";
const HKDF_INFO = "vxt_password_reset hmac-sha256";
export const PASSWORD_RESET_TTL_SECONDS = 30 * 60;

interface ResetTokenPayload {
  uid: string;
  email: string;
  fp: string;
  exp: number;
}

export type PasswordResetVerifyResult =
  | { ok: true; uid: string; email: string }
  | { ok: false; reason: "missing" | "malformed" | "signature" | "expired" | "used_or_mismatch" };

let cachedKey: Buffer | null = null;

function signingKey(): Buffer {
  if (!cachedKey) {
    const material = getAuthSecret();
    cachedKey = Buffer.from(
      crypto.hkdfSync(
        "sha256",
        Buffer.from(material, "utf8"),
        Buffer.from(HKDF_SALT),
        Buffer.from(HKDF_INFO),
        32,
      ),
    );
  }
  return cachedKey;
}

export function passwordHashFingerprint(passwordHash: string | null | undefined): string {
  return crypto
    .createHash("sha256")
    .update(passwordHash ?? "no-local-hash")
    .digest("hex")
    .slice(0, 24);
}

function signPayload(payloadB64: string): string {
  return crypto.createHmac("sha256", signingKey()).update(payloadB64).digest("base64url");
}

export function createPasswordResetToken(input: {
  uid: string;
  email: string;
  passwordHash: string | null | undefined;
  nowMs?: number;
  ttlSeconds?: number;
}): string {
  const nowSec = Math.floor((input.nowMs ?? Date.now()) / 1000);
  const payload: ResetTokenPayload = {
    uid: input.uid,
    email: input.email.trim().toLowerCase(),
    fp: passwordHashFingerprint(input.passwordHash),
    exp: nowSec + (input.ttlSeconds ?? PASSWORD_RESET_TTL_SECONDS),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${payloadB64}.${signPayload(payloadB64)}`;
}

export function decodePasswordResetToken(
  token: string,
  nowMs = Date.now(),
): { ok: true; payload: ResetTokenPayload } | { ok: false; reason: "missing" | "malformed" | "signature" | "expired" } {
  const raw = (token ?? "").trim();
  if (!raw) return { ok: false, reason: "missing" };
  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };

  const [payloadB64, sigB64] = parts;
  const expected = signPayload(payloadB64);
  const a = Buffer.from(sigB64, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "signature" };
  }

  let parsed: Partial<ResetTokenPayload>;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as Partial<ResetTokenPayload>;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof parsed.uid !== "string" ||
    !parsed.uid ||
    typeof parsed.email !== "string" ||
    !parsed.email ||
    typeof parsed.fp !== "string" ||
    !parsed.fp ||
    typeof parsed.exp !== "number"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const nowSec = Math.floor(nowMs / 1000);
  if (parsed.exp <= nowSec) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    payload: {
      uid: parsed.uid,
      email: parsed.email,
      fp: parsed.fp,
      exp: parsed.exp,
    },
  };
}

export function verifyPasswordResetTokenForUser(
  token: string,
  user: { id: string; email: string; password_hash: string | null | undefined; is_active: boolean; role: string },
  nowMs = Date.now(),
): PasswordResetVerifyResult {
  const decoded = decodePasswordResetToken(token, nowMs);
  if (!decoded.ok) return decoded;
  const { payload } = decoded;
  if (
    !user.is_active ||
    user.role === "sourcing" ||
    user.id !== payload.uid ||
    user.email.trim().toLowerCase() !== payload.email ||
    passwordHashFingerprint(user.password_hash) !== payload.fp
  ) {
    return { ok: false, reason: "used_or_mismatch" };
  }
  return { ok: true, uid: user.id, email: payload.email };
}
