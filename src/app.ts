import express from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import passport from 'passport';
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { config, isGoogleAuthConfigured } from './config/env.js';
import { errorHandler } from './middleware/error.middleware.js';
import authRouter from './routes/auth.routes.js';
import projectRouter from './routes/project.routes.js';

const allowedFrontendOrigins = new Set(
  config.FRONTEND_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

const isAllowedFrontendOrigin = (origin?: string) => {
  if (!origin) return true;
  return allowedFrontendOrigins.has(origin);
};

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: (origin, callback) => {
      callback(null, isAllowedFrontendOrigin(origin));
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  }));
  app.use(morgan('dev'));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // AUTH CONFIG
  app.use(passport.initialize());
  if (isGoogleAuthConfigured) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.GOOGLE_CLIENT_ID,
          clientSecret: config.GOOGLE_CLIENT_SECRET,
          callbackURL: config.GOOGLE_CALLBACK_URL,
        },
        (_accessToken, _refreshToken, profile, done) => {
          return done(null, profile);
        },
      ),
    );
  }

  // ROUTES
  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });
  
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectRouter);


  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use(errorHandler);

  return app;
}
