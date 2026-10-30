/**
 * Rate-limit in-memory đơn giản theo fingerprint. Trên Vercel nhiều lambda
 * không chia sẻ bộ nhớ — nhưng đủ cho MVP chặn spam cục bộ; khi scale sẽ thay
 * bằng Redis/Upstash.
 */
const BUCKETS = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetInMs: number;
  limit: number;
}

export function rateLimit(
  key: string,
  opts: { windowMs: number; max: number },
): RateLimitResult {
  const now = Date.now();
  const existing = BUCKETS.get(key);
  if (!existing || existing.resetAt < now) {
    const fresh = { count: 1, resetAt: now + opts.windowMs };
    BUCKETS.set(key, fresh);
    return { ok: true, remaining: opts.max - 1, resetInMs: opts.windowMs, limit: opts.max };
  }
  existing.count += 1;
  const resetInMs = existing.resetAt - now;
  if (existing.count > opts.max) {
    return { ok: false, remaining: 0, resetInMs, limit: opts.max };
  }
  return { ok: true, remaining: opts.max - existing.count, resetInMs, limit: opts.max };
}

/** Dọn bucket cũ — gọi định kỳ hoặc ngay trước lần check mới. */
export function gcRateLimit() {
  const now = Date.now();
  for (const [k, v] of BUCKETS) if (v.resetAt < now) BUCKETS.delete(k);
}
