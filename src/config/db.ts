import mongoose from 'mongoose';

import { config } from './config.js';
import { logger } from '../lib/logger.js';

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown database connection error';

export const connectDB = async (): Promise<void> => {
  try {
    const connection = await mongoose.connect(config.mongo.uri);
    logger.info(`MongoDB connected: ${connection.connection.host}`);
  } catch (error) {
    logger.error('MongoDB connection failed. Shutting down.', {
      error: getErrorMessage(error),
    });
    process.exit(1);
  }
};
