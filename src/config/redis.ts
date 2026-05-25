import { Redis } from 'ioredis';

import { config } from './config.js';
import { logger } from '../lib/logger.js';

export const cacheRedis = new Redis(config.redis.url, {
  lazyConnect: true,
});

export const bullRedis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

cacheRedis.on('error', (error: Error) => {
  logger.error('Cache Redis error', { error: error.message });
});

bullRedis.on('error', (error: Error) => {
  logger.error('BullMQ Redis error', { error: error.message });
});
