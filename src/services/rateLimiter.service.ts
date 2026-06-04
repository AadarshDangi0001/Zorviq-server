import { redis } from '../config/redis.js';
import { RateLimitError } from '../lib/apiError.js';

export class RateLimiterService {
  constructor(
    private readonly limit: number = 10,
    private readonly windowSecs: number = 60
  ) {}

  async check(userId: string): Promise<void> {
    const key = `rl:${userId}`;
    const count = await redis.incr(key);

    // Set TTL only on first increment (avoid resetting window)
    if (count === 1) {
      await redis.expire(key, this.windowSecs);
    }

    if (count > this.limit) {
      const ttl = await redis.ttl(key);
      throw new RateLimitError(
        `Rate limit exceeded (${this.limit} generations/min). Retry in ${ttl}s.`,
        ttl > 0 ? ttl : this.windowSecs
      );
    }
  }
}

export const rateLimiterService = new RateLimiterService();
