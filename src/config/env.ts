import dotenv from 'dotenv';

dotenv.config();

const requiredVars = ['MONGO_URI', 'JWT_SECRET'];
for (const name of requiredVars) {
  // The key list is hard-coded above; dynamic access keeps the validation loop compact.
  // eslint-disable-next-line security/detect-object-injection
  if (!process.env[name]) {
    throw new Error(`Environment variable ${name} is required but was not provided.`);
  }
}

export const config = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3000),
  MONGO_URI: process.env.MONGO_URI ?? '',
  REDIS_URL: process.env.REDIS_URL ?? '',
  REDIS_HOST: process.env.REDIS_HOST ?? '',
  REDIS_PORT: Number(process.env.REDIS_PORT ?? 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD ?? '',
  JWT_SECRET: process.env.JWT_SECRET ?? '',
  SMTP_HOST: process.env.SMTP_HOST ?? '',
  SMTP_PORT: Number(process.env.SMTP_PORT ?? 587),
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER ?? '',
  SMTP_PASS: process.env.SMTP_PASS ?? '',
  SMTP_FROM: process.env.SMTP_FROM ?? '',
  GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? '',
  GEMINI_EMBEDDING_MODEL: process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-001',
  GEMINI_EMBEDDING_DIMENSIONS: Number(process.env.GEMINI_EMBEDDING_DIMENSIONS ?? 768),
  PINECONE_API_KEY: process.env.PINECONE_API_KEY ?? '',
  PINECONE_INDEX_HOST: process.env.PINECONE_INDEX_HOST ?? '',
  PINECONE_NAMESPACE: process.env.PINECONE_NAMESPACE ?? 'code-pattern-errors',
  PINECONE_COMPONENT_NAMESPACE: process.env.PINECONE_COMPONENT_NAMESPACE ?? 'components',
  PINECONE_MEMORY_NAMESPACE: process.env.PINECONE_MEMORY_NAMESPACE ?? 'project-memory',
  PINECONE_API_VERSION: process.env.PINECONE_API_VERSION ?? '2025-10',
  PINECONE_PATTERN_THRESHOLD: Number(process.env.PINECONE_PATTERN_THRESHOLD ?? 0.78),
  PINECONE_COMPONENT_THRESHOLD: Number(process.env.PINECONE_COMPONENT_THRESHOLD ?? 0.72),
  PINECONE_MEMORY_THRESHOLD: Number(process.env.PINECONE_MEMORY_THRESHOLD ?? 0.68),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? '',
  GOOGLE_CALLBACK_URL: process.env.GOOGLE_CALLBACK_URL ?? '',
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? '',
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET ?? '',
  GITHUB_CALLBACK_URL: process.env.GITHUB_CALLBACK_URL ?? '',
  FRONTEND_ORIGINS: process.env.FRONTEND_ORIGINS ?? 'http://localhost:8080',
  LOCAL_FRONTEND_URL: process.env.LOCAL_FRONTEND_URL ?? 'http://localhost:8080',
  FRONTEND_URL:
    process.env.FRONTEND_URL || (process.env.FRONTEND_ORIGINS ?? '').split(',')[0]?.trim() || '',
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

export const getBackendUrl = (req?: {
  headers?: { host?: string; 'x-forwarded-proto'?: string };
}) => {
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
  config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET && config.GOOGLE_CALLBACK_URL
);

export const isGitHubConfigured = Boolean(
  config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET && config.GITHUB_CALLBACK_URL
);
