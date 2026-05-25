/**
 * Application Config
 * Purpose: Load and validate all environment-backed application settings.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

type NodeEnvironment = 'development' | 'production' | 'test';
type SameSite = 'strict' | 'lax' | 'none';

type Config = Readonly<{
  server: Readonly<{
    port: number;
    env: NodeEnvironment;
    isProduction: boolean;
    isDevelopment: boolean;
  }>;
  web: Readonly<{
    url: string;
  }>;
  mongo: Readonly<{
    uri: string;
  }>;
  redis: Readonly<{
    url: string;
  }>;
  jwt: Readonly<{
    accessSecret: string;
    refreshSecret: string;
    accessExpires: string;
    refreshExpires: string;
    refreshTtlSeconds: number;
  }>;
  claude: Readonly<{
    apiKey: string;
    model: string;
  }>;
  cors: Readonly<{
    origin: readonly string[];
  }>;
  cookie: Readonly<{
    secure: boolean;
    sameSite: SameSite;
  }>;
  rateLimit: Readonly<{
    globalMax: number;
    authMax: number;
    passwordMax: number;
    maxGenerationsPerMin: number;
  }>;
}>;

const required = [
  'PORT',
  'NODE_ENV',
  'MONGO_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CLAUDE_API_KEY',
] as const;

const env = process.env;

required.forEach((key) => {
  if (!env[key]) {
    throw new Error(`FATAL: Missing required environment variable: ${key}`);
  }
});

const readRequiredAlias = (primaryKey: string, fallbackKey: string): string => {
  const value = env[primaryKey] ?? env[fallbackKey];

  if (!value) {
    throw new Error(
      `FATAL: Missing required environment variable: ${primaryKey} or ${fallbackKey}`,
    );
  }

  return value;
};

const readRequired = (key: string): string => {
  const value = env[key];

  if (!value) {
    throw new Error(`FATAL: Missing required environment variable: ${key}`);
  }

  return value;
};

const parseInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) {
    return fallback;
  }

  return ['true', '1', 'yes'].includes(value.toLowerCase());
};

const parseNodeEnvironment = (value: string): NodeEnvironment => {
  if (value === 'development' || value === 'production' || value === 'test') {
    return value;
  }

  throw new Error('FATAL: NODE_ENV must be one of: development, production, test');
};

const parseSameSite = (value: string | undefined): SameSite => {
  if (value === undefined) {
    return 'strict';
  }

  if (value === 'strict' || value === 'lax' || value === 'none') {
    return value;
  }

  throw new Error('FATAL: COOKIE_SAME_SITE must be one of: strict, lax, none');
};

const parseOrigins = (value: string): readonly string[] => {
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    throw new Error('FATAL: CLIENT_URL or CORS_ORIGIN must include at least one origin');
  }

  return origins;
};

const nodeEnv = parseNodeEnvironment(readRequired('NODE_ENV'));
const redisUrl = readRequiredAlias('UPSTASH_REDIS_URL', 'REDIS_URL');
const corsOrigin = readRequiredAlias('CLIENT_URL', 'CORS_ORIGIN');
const webUrl = env.WEB_URL ?? corsOrigin.split(',')[0];

export const config: Config = Object.freeze({
  server: Object.freeze({
    port: parseInteger(readRequired('PORT'), 5000),
    env: nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
  }),
  web: Object.freeze({
    url: webUrl,
  }),
  mongo: Object.freeze({
    uri: readRequired('MONGO_URI'),
  }),
  redis: Object.freeze({
    url: redisUrl,
  }),
  jwt: Object.freeze({
    accessSecret: readRequired('JWT_ACCESS_SECRET'),
    refreshSecret: readRequired('JWT_REFRESH_SECRET'),
    accessExpires: env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshExpires: env.JWT_REFRESH_EXPIRES ?? '7d',
    refreshTtlSeconds: parseInteger(env.JWT_REFRESH_TTL_SECONDS, 7 * 24 * 60 * 60),
  }),
  claude: Object.freeze({
    apiKey: readRequired('CLAUDE_API_KEY'),
    model: env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
  }),
  cors: Object.freeze({
    origin: parseOrigins(corsOrigin),
  }),
  cookie: Object.freeze({
    secure: parseBoolean(env.COOKIE_SECURE, nodeEnv === 'production'),
    sameSite: parseSameSite(env.COOKIE_SAME_SITE),
  }),
  rateLimit: Object.freeze({
    globalMax: parseInteger(env.RATE_LIMIT_GLOBAL_MAX, 200),
    authMax: parseInteger(env.RATE_LIMIT_AUTH_MAX, 10),
    passwordMax: parseInteger(env.RATE_LIMIT_PASSWORD_MAX, 3),
    maxGenerationsPerMin: parseInteger(env.MAX_GENERATIONS_PER_MIN, 10),
  }),
});
