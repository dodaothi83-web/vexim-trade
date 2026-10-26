import "server-only";

import crypto from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { gcRateLimit, rateLimit } from "@/lib/rfq/rate-limit";
import { verifyFormChallenge } from "@/lib/security/challenge";

export type ProtectedFlow = "login" | "supplier-signup" | "admin-setup" | "service-inquiry";
type Window = "15 m" | "1 h" | "24 h";
type Policy = { name: "ip" | "account"; limit: number; windowMs: number; window: Window };

const POLICIES: Record<ProtectedFlow, Policy[]> = {
  // The account bucket also includes the IP, so an attacker cannot lock out a
  // victim by trying the victim's email from another network.
  login: [
    { name: "ip", limit: 30, windowMs: 15 * 60_000, window: "15 m" },
    { name: "account", limit: 5, windowMs: 15 * 60_000, window: "15 m" },
  ],
  "supplier-signup": [
    { name: "ip", limit: 3, windowMs: 60 * 60_000, window: "1 h" },
    { name: "account", limit: 3, windowMs: 24 * 60 * 60_000, window: "24 h" },
  ],
  "admin-setup": [
    { name: "ip", limit: 3, windowMs: 60 * 60_000, window: "1 h" },
    { name: "account", limit: 3, windowMs: 24 * 60 * 60_000, window: "24 h" },
  ],
  "service-inquiry": [
    { name: "ip", limit: 5, windowMs: 60 * 60_000, window: "1 h" },
    { name: "account", limit: 3, windowMs: 24 * 60 * 60_000, window: "24 h" },
  ],
};

export type AuthRateLimitResult = {
  status: "ok" | "limited" | "degraded";
  reason?: "not_configured" | "unavailable";
  retryAfterSeconds?: number;
};

type HeaderReader = Pick<Headers, "get">;

export function requestIp(headers: HeaderReader): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0].trim();
  const value = forwarded || headers.get("x-real-ip")?.trim() || "";
  return value && value.length <= 100 ? value : null;
}

function digest(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function identifiers(headers: HeaderReader, email?: string) {
  const ip = requestIp(headers);
  // Vercel supplies the client IP. The UA fallback prevents one global bucket
  // in local or unusual proxy setups where that header is absent.
  const network = ip ?? `unknown|${headers.get("user-agent")?.slice(0, 300) ?? ""}`;
  const ipFingerprint = digest(`vexim:auth:network:v1|${network}`);
  const cleanEmail = email?.trim().toLowerCase() ?? "";
  return {
    ip,
    ipFingerprint,
    accountFingerprint: cleanEmail ? digest(`vexim:auth:account:v1|${network}|${cleanEmail}`) : null,
  };
}

function credentials(): { url: string; token: string } | null {
  const explicitUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const explicitToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (explicitUrl && explicitToken) return { url: explicitUrl, token: explicitToken };
  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();
  if (kvUrl && kvToken) return { url: kvUrl, token: kvToken };
  return null;
}

const LIMITERS = new Map<string, { credentialKey: string; limiter: Ratelimit }>();

function limiter(flow: ProtectedFlow, policy: Policy, config: { url: string; token: string }) {
  const prefix = `vexim:auth:${flow}:${policy.name}`;
  const credentialKey = `${config.url}|${config.token}`;
  const cached = LIMITERS.get(prefix);
  if (cached?.credentialKey === credentialKey) return cached.limiter;
  const created = new Ratelimit({
    redis: new Redis({ url: config.url, token: config.token }),
    limiter: Ratelimit.fixedWindow(policy.limit, policy.window),
    analytics: false,
    prefix,
    timeout: 1_200,
  });
  LIMITERS.set(prefix, { credentialKey, limiter: created });
  return created;
}

/**
 * Local buckets protect every process. Upstash adds a shared bucket across
 * serverless instances. Only hashes are sent to Redis, never raw IP or email.
 */
export async function checkAuthRateLimit({
  flow,
  headers,
  email,
}: {
  flow: ProtectedFlow;
  headers: HeaderReader;
  email?: string;
}): Promise<AuthRateLimitResult> {
  const ids = identifiers(headers, email);
  const applicable = POLICIES[flow].filter((policy) => policy.name === "ip" || ids.accountFingerprint);
  gcRateLimit();

  for (const policy of applicable) {
    const fingerprint = policy.name === "ip" ? ids.ipFingerprint : ids.accountFingerprint!;
    const local = rateLimit(`vexim:auth:${flow}:${policy.name}:${fingerprint}`, {
      windowMs: policy.windowMs,
      max: policy.limit,
    });
    if (!local.ok) return {
      status: "limited",
      retryAfterSeconds: Math.max(1, Math.ceil(local.resetInMs / 1000)),
    };
  }

  const config = credentials();
  if (!config) return process.env.NODE_ENV === "production"
    ? { status: "degraded", reason: "not_configured" }
    : { status: "ok" };

  let degraded = false;
  for (const policy of applicable) {
    const fingerprint = policy.name === "ip" ? ids.ipFingerprint : ids.accountFingerprint!;
    try {
      const result = await limiter(flow, policy, config).limit(fingerprint);
      if (result.pending) await result.pending;
      if (result.reason === "timeout") {
        degraded = true;
        continue;
      }
      if (!result.success) return {
        status: "limited",
        retryAfterSeconds: Math.max(1, Math.ceil((result.reset - Date.now()) / 1000)),
      };
    } catch {
      degraded = true;
    }
  }
  return degraded ? { status: "degraded", reason: "unavailable" } : { status: "ok" };
}

export type AuthProtectionResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/** Shared server-side challenge and throttling for public account and enquiry forms. */
export async function protectPublicRequest({
  flow,
  headers,
  email,
  token,
}: {
  flow: ProtectedFlow;
  headers: HeaderReader;
  email: string;
  token: string;
}): Promise<AuthProtectionResult> {
  const rate = await checkAuthRateLimit({ flow, headers, email });
  if (rate.status === "limited") return {
    ok: false,
    status: 429,
    message: "Bạn đã thử quá nhiều lần. Vui lòng thử lại sau.",
  };
  if (rate.status === "degraded") {
    // The form challenge and the local limiter still apply. Unlike supplier
    // questions, a login cannot be put into a moderation queue during a Redis outage.
    console.warn(`[public-request] ${flow} distributed rate limit ${rate.reason}; local protection remains active`);
  }

  // Challenge tự chủ (proof-of-work) — thuần cục bộ nên không còn nhánh
  // "unavailable/not_configured" như hồi phụ thuộc Cloudflare.
  const challenge = verifyFormChallenge({ purpose: flow, token });
  if (!challenge.ok) return {
    ok: false,
    status: 400,
    message: challenge.reason === "expired" || challenge.reason === "replayed"
      ? "Phiên kiểm tra bảo mật đã hết hạn. Vui lòng thử lại."
      : "Không xác minh được bước bảo mật. Vui lòng thử lại.",
  };
  return { ok: true };
}

// Keep the account-specific name at existing call sites while sharing the same implementation.
export const protectPasswordAuth = protectPublicRequest;
