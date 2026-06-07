import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Profile as GoogleProfile } from 'passport-google-oauth20';
import { config } from '../config/env.js';
import { sendEmail } from './mail.service.js';
import { getPasswordResetEmail, getVerificationEmail } from '../utils/emailTemplates.js';
import { userRepository } from '../repositories/user.repository.js';
import { logger } from '../lib/logger.js';
import { CACHE_KEYS, cacheService } from './cache.service.js';
import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../lib/apiError.js';
import type { Request } from 'express';
import type { UserDocument } from '../models/User.model.js';

type AuthTokenPayload = jwt.JwtPayload & {
  id?: string;
  email?: string;
};

/**
 * Generate JWT token
 */
const generateToken = (id: string, expiresIn: jwt.SignOptions['expiresIn'] = '7d'): string => {
  return jwt.sign({ id }, config.JWT_SECRET, { expiresIn });
};

/**
 * Verify JWT token
 */
const verifyJwt = (token: string): AuthTokenPayload => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (typeof decoded === 'string') {
      throw new UnauthorizedError('Invalid token payload');
    }
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new UnauthorizedError('Invalid or expired token');
  }
};

/**
 * Generate verification email token
 */
const generateVerificationToken = (email: string): string => {
  return jwt.sign({ email }, config.JWT_SECRET, { expiresIn: '1h' });
};

const generatePasswordResetToken = (): string => crypto.randomBytes(32).toString('hex');

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

const invalidateAuthUser = async (userId: string): Promise<void> => {
  await cacheService.del(CACHE_KEYS.authUser(userId));
};

/**
 * Serialize user data (remove sensitive fields)
 */
const serializeUser = (user: UserDocument) => ({
  id: user._id,
  email: user.email,
  fullname: user.fullname,
  verified: user.verified,
});

/**
 * Registers a password-based user, hashes the password through the model hook,
 * and attempts to send a verification email.
 *
 * @returns The serialized user and a user-facing registration message.
 * @sideEffects Writes a user document and may send email.
 */
export const registerUser = async (
  email: string,
  password: string,
  fullname: string,
  contact?: string,
  backendUrl?: string
): Promise<{ user: ReturnType<typeof serializeUser>; message: string }> => {
  // Check if user already exists
  const existingUser = await userRepository.findByEmail(email);
  if (existingUser) {
    throw new ValidationError('User with this email already exists');
  }

  // Create user
  const user = await userRepository.create({
    email,
    password,
    fullname,
    contact: contact?.trim() || undefined,
    verified: false,
  });

  // Send verification email
  const verifyToken = generateVerificationToken(email);
  const verifyUrl = `${backendUrl}/api/auth/verify-email?token=${verifyToken}`;

  try {
    await sendEmail({
      to: email,
      subject: 'Verify your Zorviq account',
      html: getVerificationEmail(verifyUrl),
    });
  } catch (error) {
    logger.error('auth.verification_email_failed', {
      userId: String(user._id),
      email,
      error,
    });

    return {
      user: serializeUser(user),
      message:
        'Registration successful, but verification email delivery failed. Please request a new verification email.',
    };
  }

  return {
    user: serializeUser(user),
    message: 'Registration successful. Please check your email to verify your account.',
  };
};

/**
 * Verifies a user email from a signed verification token.
 *
 * @returns The updated user document.
 * @sideEffects Updates the user verification flag and invalidates auth cache.
 */
export const verifyUserEmail = async (token: string): Promise<UserDocument> => {
  if (!token) {
    throw new ValidationError('Token is required');
  }

  const decoded = verifyJwt(token);

  if (!decoded.email) {
    throw new ValidationError('Invalid token');
  }

  const user = await userRepository.findByEmail(decoded.email);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.verified) {
    throw new ValidationError('Already verified');
  }

  user.verified = true;
  await userRepository.saveUser(user);
  await invalidateAuthUser(String(user._id));

  return user;
};

/**
 * Authenticates a verified password-based user and issues a JWT.
 *
 * @returns Serialized user data and a signed auth token.
 */
export const loginUser = async (
  email: string,
  password: string
): Promise<{ user: ReturnType<typeof serializeUser>; token: string }> => {
  const user = await userRepository.findByEmailWithPassword(email);

  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthorizedError('Invalid email or password');
  }

  if (!user.verified) {
    throw new ForbiddenError('Please verify your email first');
  }

  const token = generateToken(String(user._id));

  return {
    user: serializeUser(user),
    token,
  };
};

/**
 * Serializes the authenticated user attached by auth middleware.
 *
 * @throws UnauthorizedError when no user is attached to the request.
 */
export const getCurrentUser = (
  user: UserDocument | undefined
): ReturnType<typeof serializeUser> => {
  if (!user) {
    throw new UnauthorizedError();
  }

  return serializeUser(user);
};

/**
 * Creates a hashed password reset token and emails the raw token link.
 *
 * @sideEffects Updates reset token fields and sends email when the user exists.
 */
export const sendPasswordResetEmail = async (
  email: string,
  frontendUrl?: string
): Promise<void> => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    return;
  }

  const resetToken = generatePasswordResetToken();
  user.resetPasswordToken = hashToken(resetToken);
  user.resetPasswordExpire = new Date(Date.now() + 3600000); // 1 hour
  await userRepository.saveUser(user);
  await invalidateAuthUser(String(user._id));

  const resetUrl = `${frontendUrl || config.FRONTEND_URL}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: email,
    subject: 'Reset your Zorviq password',
    html: getPasswordResetEmail(resetUrl),
  });
};

/**
 * Resets a password using a valid, unexpired raw reset token.
 *
 * @sideEffects Updates the password, clears reset token fields, and invalidates auth cache.
 */
export const resetUserPassword = async (token: string, newPassword: string): Promise<void> => {
  if (!token) {
    throw new ValidationError('Invalid token');
  }

  const user = await userRepository.findByResetToken(hashToken(token));
  if (!user) {
    throw new ValidationError('Invalid or expired token');
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await userRepository.saveUser(user);
  await invalidateAuthUser(String(user._id));
};

/**
 * Creates or reuses a verified user from a Google OAuth profile and issues a JWT.
 *
 * @returns Serialized user data and a signed auth token.
 */
export const handleGoogleAuth = async (
  profile: GoogleProfile | undefined
): Promise<{ user: ReturnType<typeof serializeUser>; token: string }> => {
  const email = profile?.emails?.[0]?.value;

  if (!profile || !email) {
    throw new ValidationError('Google account email not found');
  }

  let user = await userRepository.findByEmail(email);

  if (!user) {
    user = await userRepository.create({
      email,
      googleId: profile.id,
      fullname: profile.displayName || email.split('@')[0],
      verified: true,
    });
  } else if (!user.verified) {
    user.verified = true;
    await userRepository.saveUser(user);
    await invalidateAuthUser(String(user._id));
  }

  const token = generateToken(String(user._id));

  return {
    user: serializeUser(user),
    token,
  };
};

/**
 * Sends a new verification email when an unverified account exists.
 *
 * @sideEffects Sends email; intentionally no-ops for missing or already verified users.
 */
export const resendVerificationEmail = async (
  email: string,
  backendUrl?: string
): Promise<void> => {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    return;
  }

  if (user.verified) {
    return;
  }

  const verifyToken = generateVerificationToken(email);
  const verifyUrl = `${backendUrl}/api/auth/verify-email?token=${verifyToken}`;

  await sendEmail({
    to: email,
    subject: 'Verify your Zorviq account',
    html: getVerificationEmail(verifyUrl),
  });
};

/**
 * Adds a still-valid JWT to the Redis-backed token blocklist.
 *
 * @sideEffects Writes a blocklist cache entry when Redis is configured.
 */
export const logoutUser = async (token?: string): Promise<void> => {
  if (!token) return;

  try {
    const decoded = verifyJwt(token);
    if (decoded.exp) {
      const expireTime = decoded.exp - Math.floor(Date.now() / 1000);
      if (expireTime > 0) {
        await cacheService.set(CACHE_KEYS.blockedToken(token), true, expireTime);
      }
    }
  } catch (error) {
    logger.warn('auth.logout_blocklist_skipped', { error });
  }
};

/**
 * Reads an auth token from the request cookie or Authorization bearer header.
 */
export const getTokenFromRequest = (req: Request): string | null => {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  return token || null;
};
