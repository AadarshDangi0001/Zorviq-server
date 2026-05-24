import dotenv from 'dotenv';

const result = dotenv.config();
if (result.error) {
  throw new Error('Unable to load .env file. Create a .env or .env.local file from .env.example.');
}

const requiredVars = ['MONGO_URI', 'JWT_SECRET'];
for (const name of requiredVars) {
  if (!process.env[name]) {
    throw new Error(`Environment variable ${name} is required but was not provided.`);
  }
}

export const NODE_ENV = process.env.NODE_ENV ?? 'development';
export const PORT = Number(process.env.PORT ?? 4000);
export const MONGO_URI = process.env.MONGO_URI ?? '';
export const REDIS_URL = process.env.REDIS_URL ?? '';
export const JWT_SECRET = process.env.JWT_SECRET ?? '';
export const SENTRY_DSN = process.env.SENTRY_DSN ?? '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000);
export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100);
