import { Redis, type RedisOptions } from 'ioredis';
import { config } from './env.js';
import { ServiceUnavailableError } from '../lib/apiError.js';
import { logger } from '../lib/logger.js';

const redisOptions: RedisOptions | null = config.REDIS_HOST
  ? {
      host: config.REDIS_HOST,
      port: config.REDIS_PORT,
      password: config.REDIS_PASSWORD || undefined,
    }
  : null;

export const redisClient = config.REDIS_URL
  ? new Redis(config.REDIS_URL)
  : redisOptions
    ? new Redis(redisOptions)
    : null;

export const ensureRedis = (): Redis => {
  if (!redisClient) {
    throw new ServiceUnavailableError('Redis is not configured. Set REDIS_URL or REDIS_HOST.');
  }

  return redisClient;
};

export const redis = new Proxy({} as Redis, {
  get(_target, prop: keyof Redis) {
    const client = ensureRedis();
    // Proxying Redis preserves the existing runtime guard while forwarding known Redis members.
    // eslint-disable-next-line security/detect-object-injection
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

if (redisClient) {
  redisClient.on('connect', () => logger.info('Redis Connected'));
  redisClient.on('error', (error: Error) => logger.error('redis.error', { error }));
} else {
  logger.warn('redis.not_configured');
}
