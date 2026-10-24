import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export type SupplierQuestionRateLimitResult =
  | { status: "ok" }
  | { status: "limited"; resetAt: number }
  | { status: "degraded"; reason: "not_configured" | "unavailable" };

let ipLimiter: Ratelimit | null = null;
let buyerSupplierLimiter: Ratelimit | null = null;

function getLimiters() {
  // Vercel's native Upstash integration injects KV_REST_API_* instead of the
  // Upstash Console names. Prefer an explicitly configured complete pair and
  // never combine credentials from two different databases.
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const vercelUrl = process.env.KV_REST_API_URL?.trim();
  const vercelToken = process.env.KV_REST_API_TOKEN?.trim();
  const useUpstash = Boolean(upstashUrl && upstashToken);
  const url = useUpstash ? upstashUrl : vercelUrl;
  const token = useUpstash ? upstashToken : vercelToken;
  if (!url || !token) return null;
  if (!ipLimiter || !buyerSupplierLimiter) {
    const redis = new Redis({ url, token });
    // A timeout returns reason="timeout" from the library. It is handled as
    // degraded below, never as permission to send directly.
    ipLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(5, "1 h"),
      prefix: "vexim:supplier-question:ip",
      timeout: 2_000,
    });
    buyerSupplierLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(3, "24 h"),
      prefix: "vexim:supplier-question:buyer-supplier",
      timeout: 2_000,
    });
  }
  return { ipLimiter, buyerSupplierLimiter };
}

/** Distributed abuse control for direct supplier questions only. Quote RFQs keep their existing flow. */
export async function checkSupplierQuestionRateLimit(input: {
  ipFingerprint: string;
  buyerSupplierFingerprint: string;
}): Promise<SupplierQuestionRateLimitResult> {
  try {
    const limiters = getLimiters();
    if (!limiters) {
      if (process.env.NODE_ENV === "production") return { status: "degraded", reason: "not_configured" };
      return { status: "ok" };
    }
    const [ip, buyerSupplier] = await Promise.all([
      limiters.ipLimiter.limit(input.ipFingerprint),
      limiters.buyerSupplierLimiter.limit(input.buyerSupplierFingerprint),
    ]);
    if (ip.reason === "timeout" || buyerSupplier.reason === "timeout") {
      return { status: "degraded", reason: "unavailable" };
    }
    if (!ip.success || !buyerSupplier.success) {
      return { status: "limited", resetAt: Math.max(ip.reset, buyerSupplier.reset) };
    }
    // Do not leave background analytics/synchronization rejections unhandled.
    await Promise.all([ip.pending, buyerSupplier.pending]);
    return { status: "ok" };
  } catch {
    return { status: "degraded", reason: "unavailable" };
  }
}
