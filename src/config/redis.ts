import { Redis, type RedisOptions } from 'ioredis';
import { config } from './env.js';

const redisOptions: RedisOptions | null = config.REDIS_HOST
  ? {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined
    }
  : null;

export const redisClient = config.REDIS_URL
  ? new Redis(config.REDIS_URL)
  : redisOptions
    ? new Redis(redisOptions)
    : null;

export const redis =
  redisClient ??
  (() => {
    throw new Error("Redis is not configured. Set REDIS_URL or REDIS_HOST.");
  })();

if (redisClient) {
  redisClient.on('connect', () => console.log('connected to redis'));
  redisClient.on('error', (error: Error) => console.error('Redis error:', error));
} else {
  console.warn('REDIS_URL or REDIS_HOST is not set. Redis client will not be initialized.');
}
