import winston from 'winston';

const logLevel = process.env.LOG_LEVEL?.trim() || 'info';

const serializeValue = (value: unknown): unknown => {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...Object.fromEntries(
        Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined)
      ),
    };
  }

  return value;
};

const formatMetadata = (metadata: Record<string, unknown>): string => {
  const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return '';
  }

  const serialized = Object.fromEntries(
    entries.map(([key, value]) => [key, serializeValue(value)])
  );

  return ` ${JSON.stringify(serialized)}`;
};

const developmentFormat = winston.format.printf((info) => {
  const { timestamp, level, message, stack, ...metadata } = info;
  const errorStack = typeof stack === 'string' ? `\n${stack}` : '';
  return `${String(timestamp)} ${String(level)}: ${String(message)}${formatMetadata(metadata)}${errorStack}`;
});

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production' ? winston.format.json() : developmentFormat
  ),
  transports: [new winston.transports.Console()],
});
