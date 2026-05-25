import type { Server } from 'node:http';
import mongoose from 'mongoose';

import app from './src/app.js';
import { connectDB } from './src/config/db.js';
import { bullRedis, cacheRedis } from './src/config/redis.js';
import { config } from './src/config/config.js';
import { logger } from './src/lib/logger.js';

let server: Server | undefined;

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown server error';

const startServer = async (): Promise<void> => {
  try {
    await connectDB();

    server = app.listen(config.server.port, () => {
      logger.info(
        `Server running in ${config.server.env} mode on port ${String(config.server.port)}`,
      );
    });
  } catch (error) {
    logger.error('Startup error', { error: getErrorMessage(error) });
    process.exit(1);
  }
};

const closeConnections = async (): Promise<void> => {
  await mongoose.connection.close();
  cacheRedis.disconnect();
  bullRedis.disconnect();
};

const shutdown = (signal: 'SIGTERM' | 'SIGINT'): void => {
  logger.info(`${signal} received. Shutting down gracefully...`);

  if (!server) {
    process.exit(0);
  }

  server.close(() => {
    void (async () => {
      try {
        await closeConnections();
        logger.info('All connections closed. Exiting.');
        process.exit(0);
      } catch (error) {
        logger.error('Graceful shutdown failed', { error: getErrorMessage(error) });
        process.exit(1);
      }
    })();
  });
};

process.on('unhandledRejection', (error: unknown) => {
  logger.error('Unhandled rejection', { error: getErrorMessage(error) });
  process.exit(1);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught exception', { error: error.message });
  process.exit(1);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

void startServer();
