import cors from 'cors';
import express from 'express';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';

import { config } from './config/config.js';
import { morganStream } from './lib/logger.js';
import { errorHandler } from './middleware/error.middleware.js';
import { notFoundHandler } from './middleware/notFound.middleware.js';
import { globalLimiter } from './middleware/rateLimit.middleware.js';

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: [...config.cors.origin],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);

app.use('/api', globalLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

app.use(hpp());

app.use(mongoSanitize());

app.use(morgan('combined', { stream: morganStream }));

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    statusCode: 200,
    message: 'Healthy',
    data: {
      uptime: process.uptime(),
      environment: config.server.env,
    },
  });
});

app.use(notFoundHandler);

app.use(errorHandler);

export default app;
