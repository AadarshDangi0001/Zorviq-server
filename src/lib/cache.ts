import { cacheRedis } from '../config/redis.js';
import { logger } from './logger.js';

/**
 * Cache key convention:
 * project:{projectId}           TTL: 300s
 * user:projects:{userId}        TTL: 30s
 * ratelimit:gen:{userId}        TTL: 60s (managed by rate limiter, not cache.ts)
 * blacklist:{jti}               TTL: 604800s (7 days, managed by auth service)
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await cacheRedis.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      logger.warn('Redis cache get failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      });
      return null;
    }
  },

  async set(key: string, value: unknown, ttlSeconds: number): Promise<boolean | null> {
    try {
      await cacheRedis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return true;
    } catch (error) {
      logger.warn('Redis cache set failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      });
      return null;
    }
  },

  async del(key: string): Promise<number | null> {
    try {
      return await cacheRedis.del(key);
    } catch (error) {
      logger.warn('Redis cache delete failed', {
        key,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      });
      return null;
    }
  },

  async delPattern(prefix: string): Promise<number | null> {
    try {
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [nextCursor, keys] = await cacheRedis.scan(
          cursor,
          'MATCH',
          `${prefix}*`,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          deletedCount += await cacheRedis.del(...keys);
        }
      } while (cursor !== '0');

      return deletedCount;
    } catch (error) {
      logger.warn('Redis cache pattern delete failed', {
        prefix,
        error: error instanceof Error ? error.message : 'Unknown Redis error',
      });
      return null;
    }
  },
};
