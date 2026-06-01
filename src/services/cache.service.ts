import { redisClient } from "../config/redis.js";

export async function getCache<T>(key: string): Promise<T | null> {
  if (!redisClient) return null;

  try {
    const raw = await redisClient.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    console.warn("Cache get failed:", { err, key });
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttl: number) {
  if (!redisClient) return;

  try {
    await redisClient.set(key, JSON.stringify(value), "EX", ttl);
  } catch (err) {
    console.warn("Cache set failed:", { err, key });
  }
}

export async function delCache(...keys: string[]) {
  if (!redisClient || keys.length === 0) return;

  try {
    await redisClient.del(...keys);
  } catch (err) {
    console.warn("Cache delete failed:", { err, keys });
  }
}
