import rateLimit from 'express-rate-limit';

import { config } from '../config/config.js';

export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, statusCode: 429, message: 'Too many requests, slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, statusCode: 429, message: 'Too many auth attempts.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: config.rateLimit.maxGenerationsPerMin,
  message: { success: false, statusCode: 429, message: 'Generation limit reached. Wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});
