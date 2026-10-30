import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { rateLimit } from "@/lib/rfq/rate-limit";

let limiter: Ratelimit | null = null;

/** Limit automatic paid AI calls across all instances, keyed by authorized actor. */
export async function checkProductNameTranslationLimit(actorKey: string): Promise<boolean> {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const vercelUrl = process.env.KV_REST_API_URL?.trim();
  const vercelToken = process.env.KV_REST_API_TOKEN?.trim();
  const useUpstash = Boolean(upstashUrl && upstashToken);
  const url = useUpstash ? upstashUrl : vercelUrl;
  const token = useUpstash ? upstashToken : vercelToken;
  if (!url || !token) {
    // A local limit is not shared across serverless instances. Do not make paid
    // automatic calls in production without distributed abuse protection.
    return process.env.NODE_ENV !== "production" && rateLimit(`product-name:${actorKey}`, { windowMs: 60 * 60 * 1000, max: 30 }).ok;
  }
  try {
    if (!limiter) limiter = new Ratelimit({ redis: new Redis({ url, token }), limiter: Ratelimit.fixedWindow(30, "1 h"),
      prefix: "vexim:product-name-translation", timeout: 2_000 });
    const result = await limiter.limit(actorKey);
    if (result.reason === "timeout" || !result.success) {
      void result.pending.catch(() => {});
      return false;
    }
    await result.pending;
    return true;
  } catch { return false; }
}
