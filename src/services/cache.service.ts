import crypto from 'crypto';
import { redisClient } from '../config/redis.js';
import { logger } from '../lib/logger.js';

export const CACHE_TTL_SECONDS = {
  authUser: 5 * 60,
  projectList: 60,
  projectDetail: 2 * 60,
} as const;

export const CACHE_KEYS = {
  authUser: (userId: string) => `auth:user:${userId}`,
  blockedToken: (token: string) =>
    `auth:blocked:${crypto.createHash('sha256').update(token).digest('hex')}`,
  projectList: (userId: string) => `projects:${userId}:list`,
  projectDetail: (userId: string, projectId: string) => `projects:${userId}:detail:${projectId}`,
} as const;

class CacheService {
  async get<T>(key: string): Promise<T | null> {
    if (!redisClient) return null;

    try {
      const raw = await redisClient.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (error) {
      logger.warn('cache.get_failed', { key, error });
      return null;
    }
  }

  async getRaw(key: string): Promise<string | null> {
    if (!redisClient) return null;

    try {
      return redisClient.get(key);
    } catch (error) {
      logger.warn('cache.get_raw_failed', { key, error });
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!redisClient) return;

    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      logger.warn('cache.set_failed', { key, ttlSeconds, error });
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!redisClient || keys.length === 0) return;

    try {
      await redisClient.del(...keys);
    } catch (error) {
      logger.warn('cache.del_failed', { keys, error });
    }
  }
}

export const cacheService = new CacheService();
