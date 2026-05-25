import dotenv from 'dotenv';

const result = dotenv.config();
if (result.error) {
  throw new Error('Unable to load .env file. Create a .env or .env.local file from .env.example.');
}

const requiredVars = ['MONGO_URI', 'JWT_SECRET', 'FRONTEND_ORIGINS'];
for (const name of requiredVars) {
  if (!process.env[name]) {
    throw new Error(`Environment variable ${name} is required but was not provided.`);
  }
}

export const config = { 
  NODE_ENV : process.env.NODE_ENV ?? 'development',
  PORT : Number(process.env.PORT ?? 4000),
  MONGO_URI : process.env.MONGO_URI ?? '',
  REDIS_URL : process.env.REDIS_URL ?? '',
  REDIS_HOST : process.env.REDIS_HOST ?? '',
  REDIS_PORT : Number(process.env.REDIS_PORT ?? 6379),
  REDIS_PASSWORD : process.env.REDIS_PASSWORD ?? '',
  JWT_SECRET : process.env.JWT_SECRET ?? '',
  RESEND_API_KEY : process.env.RESEND_API_KEY ?? '',
  GOOGLE_CLIENT_ID : process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET : process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_CALLBACK_URL : process.env.GOOGLE_CALLBACK_URL ?? '',
  FRONTEND_ORIGINS : process.env.FRONTEND_ORIGINS ?? '',
  LOCAL_FRONTEND_URL : process.env.LOCAL_FRONTEND_URL ?? 'http://localhost:3000',
  FRONTEND_URL : process.env.FRONTEND_URL || (process.env.FRONTEND_ORIGINS ?? '').split(',')[0]?.trim() || ''
};

export const getFrontendUrl = (req?: { headers?: { origin?: string } }) => {
  const origins = config.FRONTEND_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const requestOrigin = req?.headers?.origin;

  if (requestOrigin && origins.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (config.NODE_ENV === 'development') {
    return config.LOCAL_FRONTEND_URL;
  }

  return config.FRONTEND_URL || origins[0] || config.LOCAL_FRONTEND_URL;
};

export const getBackendUrl = (req?: { headers?: { host?: string; 'x-forwarded-proto'?: string } }) => {
  if (config.NODE_ENV === 'development') {
    return `http://localhost:${config.PORT}`;
  }
  
  const host = req?.headers?.host;
  if (host) {
    const protocol = req?.headers?.['x-forwarded-proto'] || 'https';
    return `${protocol}://${host}`;
  }
  
  return config.FRONTEND_URL;
};

export const isGoogleAuthConfigured = Boolean(
  config.GOOGLE_CLIENT_ID &&
    config.GOOGLE_CLIENT_SECRET &&
    config.GOOGLE_CALLBACK_URL
);
// export const SENTRY_DSN = process.env.SENTRY_DSN ?? '';
// export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
// export const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60000);
// export const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX ?? 100);
