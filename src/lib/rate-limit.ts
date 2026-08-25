interface Bucket {
  tokens: number;
  updatedAt: number;
  limit: number;
}

const globalForRl = globalThis as unknown as { sentinelBuckets?: Map<string, Bucket> };
const buckets: Map<string, Bucket> = globalForRl.sentinelBuckets ?? new Map();
globalForRl.sentinelBuckets = buckets;

export interface RateVerdict {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

/**
 * Token bucket, refilled continuously at limit/minute. In-process by design:
 * an on-premise gateway runs as a single PM2 instance, so no shared store is
 * needed. Scale horizontally and this becomes per-instance.
 */
export function consume(identifier: string, limitPerMinute: number): RateVerdict {
  const limit = Math.max(1, limitPerMinute);
  const now = Date.now();
  const refillPerMs = limit / 60_000;

  let bucket = buckets.get(identifier);
  if (!bucket || bucket.limit !== limit) {
    bucket = { tokens: limit, updatedAt: now, limit };
    buckets.set(identifier, bucket);
  }

  bucket.tokens = Math.min(limit, bucket.tokens + (now - bucket.updatedAt) * refillPerMs);
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    const waitMs = (1 - bucket.tokens) / refillPerMs;
    return {
      allowed: false,
      limit,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
      resetAt: now + waitMs,
    };
  }

  bucket.tokens -= 1;
  return {
    allowed: true,
    limit,
    remaining: Math.floor(bucket.tokens),
    retryAfterSeconds: 0,
    resetAt: now + (limit - bucket.tokens) / refillPerMs,
  };
}

export function bucketSnapshot(): Array<{ key: string; remaining: number; limit: number }> {
  return [...buckets.entries()].map(([key, b]) => ({
    key,
    remaining: Math.floor(b.tokens),
    limit: b.limit,
  }));
}

/** Drops buckets untouched for 10 minutes so memory stays flat. */
export function sweepBuckets(): void {
  const cutoff = Date.now() - 600_000;
  for (const [key, b] of buckets) if (b.updatedAt < cutoff) buckets.delete(key);
}
