import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import userModel from '../models/User.model.js';
import { CACHE_KEYS, CACHE_TTL_SECONDS, cacheService } from '../services/cache.service.js';

type AuthTokenPayload = jwt.JwtPayload & {
  id?: string;
};

type CachedAuthUser = {
  _id: string;
  email: string;
  fullname: string;
  verified: boolean;
  role?: string;
  contact?: string;
  googleId?: string;
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : 'Unknown error';
};

export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  // Accept from cookie OR Authorization: Bearer <token>
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized: No token provided', success: false });
  }

  try {
    // 1. Check Redis blocklist (for logged-out tokens)
    const isBlocked = await cacheService.get<boolean>(CACHE_KEYS.blockedToken(token));
    const isLegacyBlocked = await cacheService.getRaw(`bl_${token}`);
    if (isBlocked || isLegacyBlocked) {
      return res.status(401).json({ message: 'Unauthorized: Token is invalid', success: false });
    }

    // 2. Verify JWT
    const decoded = jwt.verify(token, config.JWT_SECRET) as AuthTokenPayload;
    if (!decoded.id) {
      return res
        .status(401)
        .json({ message: 'Unauthorized: Invalid token payload', success: false });
    }

    // 3. Find User, preferring the short-lived auth cache
    const cacheKey = CACHE_KEYS.authUser(decoded.id);
    const cachedUser = await cacheService.get<CachedAuthUser>(cacheKey);
    if (cachedUser) {
      req.user = cachedUser;
      next();
      return;
    }

    const user = await userModel
      .findById(decoded.id)
      .select('-password')
      .lean<CachedAuthUser>()
      .exec();

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized: User not found', success: false });
    }

    const authUser: CachedAuthUser = {
      _id: String(user._id),
      email: user.email,
      fullname: user.fullname,
      verified: user.verified,
      role: user.role,
      contact: user.contact,
      googleId: user.googleId,
    };

    if (decoded.exp) {
      const secondsUntilExpiry = decoded.exp - Math.floor(Date.now() / 1000);
      if (secondsUntilExpiry > 0) {
        await cacheService.set(
          cacheKey,
          authUser,
          Math.min(CACHE_TTL_SECONDS.authUser, secondsUntilExpiry)
        );
      }
    }

    req.user = authUser;
    next();
  } catch (err) {
    logger.warn('auth.middleware.invalid_token', { error: getErrorMessage(err) });
    return res.status(401).json({ message: 'Unauthorized: Invalid token', success: false });
  }
};

export const authMiddleware = authenticateUser;
