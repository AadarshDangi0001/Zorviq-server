import jwt from "jsonwebtoken";
import type { Profile as GoogleProfile } from "passport-google-oauth20";
import { config } from "../config/env.js";
import { redisClient } from "../config/redis.js";
import { sendEmail } from "./mail.service.js";
import { getPasswordResetEmail, getVerificationEmail } from "../utils/emailTemplates.js";
import { userRepository } from "../repositories/user.repository.js";
import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "../lib/apiError.js";
import type { Request } from "express";
import type { UserDocument } from "../models/User.model.js";

type AuthTokenPayload = jwt.JwtPayload & {
  id?: string;
  email?: string;
};

/**
 * Generate JWT token
 */
const generateToken = (
  id: string,
  expiresIn: jwt.SignOptions["expiresIn"] = "7d"
): string => {
  return jwt.sign({ id }, config.JWT_SECRET, { expiresIn });
};

/**
 * Verify JWT token
 */
const verifyJwt = (token: string): AuthTokenPayload => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);
    if (typeof decoded === "string") {
      throw new UnauthorizedError("Invalid token payload");
    }
    return decoded;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new UnauthorizedError("Invalid or expired token");
  }
};

/**
 * Generate verification email token
 */
const generateVerificationToken = (email: string): string => {
  return jwt.sign({ email }, config.JWT_SECRET, { expiresIn: "1h" });
};

/**
 * Generate password reset token
 */
const generateResetToken = (userId: string): string => {
  return generateToken(userId, "1h");
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
 * Register a new user
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
    throw new ValidationError("User with this email already exists");
  }

  // Create user
  const user = await userRepository.create({
    email,
    password,
    fullname,
    contact,
    verified: false,
  });

  // Send verification email
  const verifyToken = generateVerificationToken(email);
  const verifyUrl = `${backendUrl}/api/auth/verify-email?token=${verifyToken}`;

  try {
    await sendEmail({
      to: email,
      subject: "Verify your Zorviq account",
      html: getVerificationEmail(verifyUrl),
    });
  } catch (error) {
    // Rollback user creation if email fails
    await userRepository.deleteById(String(user._id));
    throw new ApiError(
      500,
      "INTERNAL_SERVER_ERROR",
      "Failed to send verification email. Registration rolled back."
    );
  }

  return {
    user: serializeUser(user),
    message: "Registration successful. Please check your email to verify your account.",
  };
};

/**
 * Verify user email
 */
export const verifyUserEmail = async (token: string): Promise<UserDocument> => {
  if (!token) {
    throw new ValidationError("Token is required");
  }

  const decoded = verifyJwt(token);

  if (!decoded.email) {
    throw new ValidationError("Invalid token");
  }

  const user = await userRepository.findByEmail(decoded.email);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.verified) {
    throw new ValidationError("Already verified");
  }

  user.verified = true;
  await userRepository.saveUser(user);

  return user;
};

/**
 * Login user
 */
export const loginUser = async (
  email: string,
  password: string
): Promise<{ user: ReturnType<typeof serializeUser>; token: string }> => {
  const user = await userRepository.findByEmailWithPassword(email);

  if (!user || !(await user.comparePassword(password))) {
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.verified) {
    throw new ForbiddenError("Please verify your email first");
  }

  const token = generateToken(String(user._id));

  return {
    user: serializeUser(user),
    token,
  };
};

/**
 * Get current user
 */
export const getCurrentUser = (user: UserDocument | undefined): ReturnType<typeof serializeUser> => {
  if (!user) {
    throw new UnauthorizedError();
  }

  return serializeUser(user);
};

/**
 * Forgot password - Send reset email
 */
export const sendPasswordResetEmail = async (email: string, frontendUrl?: string): Promise<void> => {
  const user = await userRepository.findByEmail(email);
  if (!user) {
    throw new NotFoundError("User not found");
  }

  const resetToken = generateResetToken(String(user._id));
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpire = new Date(Date.now() + 3600000); // 1 hour
  await userRepository.saveUser(user);

  const resetUrl = `${frontendUrl || config.FRONTEND_URL}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: email,
    subject: "Reset your Zorviq password",
    html: getPasswordResetEmail(resetUrl),
  });
};

/**
 * Reset password
 */
export const resetUserPassword = async (token: string, newPassword: string): Promise<void> => {
  const decoded = verifyJwt(token);

  if (!decoded.id) {
    throw new ValidationError("Invalid token");
  }

  const user = await userRepository.findByResetToken(String(decoded.id), token);
  if (!user) {
    throw new ValidationError("Invalid or expired token");
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await userRepository.saveUser(user);
};

/**
 * Google OAuth callback
 */
export const handleGoogleAuth = async (
  profile: GoogleProfile | undefined
): Promise<{ user: ReturnType<typeof serializeUser>; token: string }> => {
  const email = profile?.emails?.[0]?.value;

  if (!profile || !email) {
    throw new ValidationError("Google account email not found");
  }

  let user = await userRepository.findByEmail(email);

  if (!user) {
    user = await userRepository.create({
      email,
      googleId: profile.id,
      fullname: profile.displayName || email.split("@")[0],
      verified: true,
    });
  } else if (!user.verified) {
    user.verified = true;
    await userRepository.saveUser(user);
  }

  const token = generateToken(String(user._id));

  return {
    user: serializeUser(user),
    token,
  };
};

/**
 * Resend verification email
 */
export const resendVerificationEmail = async (email: string, backendUrl?: string): Promise<void> => {
  const user = await userRepository.findByEmail(email);

  if (!user) {
    throw new NotFoundError("User not found");
  }

  if (user.verified) {
    throw new ValidationError("User already verified");
  }

  const verifyToken = generateVerificationToken(email);
  const verifyUrl = `${backendUrl}/api/auth/verify-email?token=${verifyToken}`;

  await sendEmail({
    to: email,
    subject: "Verify your Zorviq account",
    html: getVerificationEmail(verifyUrl),
  });
};

/**
 * Logout user - Add token to blocklist
 */
export const logoutUser = async (token?: string): Promise<void> => {
  if (!token) return;

  try {
    const decoded = verifyJwt(token);
    if (redisClient && decoded.exp) {
      const expireTime = decoded.exp - Math.floor(Date.now() / 1000);
      if (expireTime > 0) {
        await redisClient.set(`bl_${token}`, "blocked", "EX", expireTime);
      }
    }
  } catch (error) {
    console.warn("Logout token blocklist skipped:", error);
  }
};

/**
 * Get token from request
 */
export const getTokenFromRequest = (req: Request): string | null => {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  return token || null;
};
