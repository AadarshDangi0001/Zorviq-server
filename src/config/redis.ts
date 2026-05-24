import Redis from 'ioredis';
import { REDIS_URL } from './env.js';

export const redisClient = REDIS_URL ? new Redis(REDIS_URL) : null;

if (redisClient) {
  redisClient.on('connect', () => console.log('Redis connected'));
  redisClient.on('error', (error) => console.error('Redis error:', error));
} else {
  console.warn('REDIS_URL is not set. Redis client will not be initialized.');
}
