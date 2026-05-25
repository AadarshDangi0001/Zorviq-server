import { mkdirSync } from 'node:fs';
import winston from 'winston';

import { config } from '../config/config.js';

const { combine, colorize, errors, json, printf, timestamp } = winston.format;

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const toLogText = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    typeof value === 'symbol'
  ) {
    return String(value);
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return 'Unserializable log message';
  }
};

const developmentFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: loggedAt, stack, ...metadata }) => {
    const details = Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
    const logTimestamp = typeof loggedAt === 'string' ? loggedAt : '';
    const logMessage = typeof stack === 'string' ? stack : toLogText(message);
    return `${logTimestamp} ${level}: ${logMessage}${details}`;
  }),
);

const productionFormat = combine(timestamp(), errors({ stack: true }), json());

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.server.isProduction ? productionFormat : developmentFormat,
  }),
];

if (config.server.isProduction) {
  mkdirSync('logs', { recursive: true });
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  );
}

// Never log passwords, tokens, authorization headers, or secret values.
export const logger = winston.createLogger({
  levels,
  level: config.server.isProduction ? 'info' : 'debug',
  transports,
  exitOnError: false,
});

export const morganStream = {
  write: (message: string): void => {
    logger.http(message.trim());
  },
};
