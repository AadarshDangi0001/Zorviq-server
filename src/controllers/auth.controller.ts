import type { CookieOptions, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Profile as GoogleProfile } from "passport-google-oauth20";
import { config, getFrontendUrl, getBackendUrl } from "../config/env.js";
import { redisClient } from "../config/redis.js";
import userModel, { type UserDocument } from "../models/User.model.js";
import { sendEmail } from "../services/auth.service.js";
import asyncHandler from "../utils/asyncHandler.js";
import { getPasswordResetEmail, getVerificationEmail } from "../utils/emailTemplates.js";

type AuthTokenPayload = jwt.JwtPayload & {
  id?: string;
  email?: string;
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "Unknown error";
};

const verifyJwt = (token: string): AuthTokenPayload => {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (typeof decoded === "string") {
    throw new Error("Invalid token payload");
  }

  return decoded;
};

const generateToken = (
  id: string,
  expiresIn: jwt.SignOptions["expiresIn"] = "7d"
) => {
  return jwt.sign({ id }, config.JWT_SECRET, { expiresIn });
};

const getAuthCookieOptions = (req: Request): CookieOptions => {
  const host = req.headers.host || "";
  const isLocalBackend = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const isHttpsRequest =
    req.secure || req.headers["x-forwarded-proto"] === "https" || !isLocalBackend;

  return {
    httpOnly: true,
    secure: isHttpsRequest,
    sameSite: isHttpsRequest ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

const getClearCookieOptions = (req: Request): CookieOptions => {
  const { maxAge: _maxAge, ...options } = getAuthCookieOptions(req);
  return options;
};

const serializeUser = (user: UserDocument) => ({
  id: user._id,
  email: user.email,
  fullname: user.fullname,
  verified: user.verified,
});

const sendTokenResponse = (user: UserDocument, req: Request, res: Response, message: string) => {
  const token = generateToken(String(user._id));

  res.cookie("token", token, getAuthCookieOptions(req));

  res.status(200).json({
    message,
    success: true,
    token,
    user: serializeUser(user),
  });
};

// @desc    Register user
// @route   POST /api/auth/register
export const register = asyncHandler(async (req, res) => {
  const { email, contact, password, fullname } = req.body;

  const existingUser = await userModel.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "User with this email already exists", success: false });
  }

  const user = await userModel.create({
    email,
    contact,
    password,
    fullname,
    verified: false,
  });

  const verifyToken = jwt.sign({ email: user.email }, config.JWT_SECRET, { expiresIn: "1h" });
  const verifyUrl = `${getBackendUrl(req)}/api/auth/verify-email?token=${verifyToken}`;

  try {
    await sendEmail({
      to: email,
      subject: "Verify your Zorviq account",
      html: getVerificationEmail(verifyUrl),
    });

    res.status(201).json({
      message: "Registration successful. Please check your email to verify your account.",
      success: true,
    });
  } catch (emailError) {
    console.error("Email failed:", emailError);
    await userModel.findByIdAndDelete(user._id);
    return res.status(500).json({
      message: "Failed to send verification email. User registration rolled back.",
      success: false,
    });
  }
});

// @desc    Verify email
// @route   GET /api/auth/verify-email
export const verifyEmail = asyncHandler(async (req, res) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  if (!token) return res.status(400).json({ message: "Token is required", success: false });

  let decoded: AuthTokenPayload;
  try {
    decoded = verifyJwt(token);
  } catch {
    return res.status(400).json({ message: "Invalid or expired token", success: false });
  }

  if (!decoded.email) {
    return res.status(400).json({ message: "Invalid token", success: false });
  }

  const user = await userModel.findOne({ email: decoded.email });

  if (!user) return res.status(404).json({ message: "User not found", success: false });
  if (user.verified) return res.json({ message: "Already verified", success: true });

  user.verified = true;
  await user.save();

  res.json({ message: "Email verified successfully", success: true });
});

// @desc    Login user
// @route   POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await userModel.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: "Invalid email or password", success: false });
  }

  if (!user.verified) {
    return res.status(403).json({ message: "Please verify your email first", success: false });
  }

  sendTokenResponse(user, req, res, "Login successful");
});

// @desc    Get current user
// @route   GET /api/auth/get-me
export const getMe = asyncHandler(async (req, res) => {
  const user = req.user as UserDocument | undefined;
  if (!user) {
    return res.status(401).json({ message: "Unauthorized", success: false });
  }

  res.status(200).json({
    success: true,
    user: serializeUser(user),
  });
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await userModel.findOne({ email });

  if (!user) return res.status(404).json({ message: "User not found", success: false });

  const resetToken = generateToken(String(user._id), "1h");
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpire = new Date(Date.now() + 3600000);
  await user.save();

  const resetUrl = `${getFrontendUrl(req)}/reset-password?token=${resetToken}`;

  await sendEmail({
    to: email,
    subject: "Reset your Zorviq password",
    html: getPasswordResetEmail(resetUrl),
  });

  res.json({ message: "Password reset link sent", success: true });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  let decoded: AuthTokenPayload;
  try {
    decoded = verifyJwt(token);
  } catch {
    return res.status(400).json({ message: "Invalid or expired token", success: false });
  }

  if (!decoded.id) {
    return res.status(400).json({ message: "Invalid token", success: false });
  }

  const user = await userModel.findOne({
    _id: decoded.id,
    resetPasswordToken: token,
    resetPasswordExpire: { $gt: new Date() },
  });

  if (!user) return res.status(400).json({ message: "Invalid or expired token", success: false });

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.json({ message: "Password reset successful", success: true });
});

// @desc    Google auth callback
// @route   GET /api/auth/google/callback
export const googleCallback = asyncHandler(async (req, res) => {
  const profile = req.user as GoogleProfile | undefined;
  const email = profile?.emails?.[0]?.value;

  if (!profile || !email) {
    return res.status(400).json({ message: "Google account email not found", success: false });
  }

  let user = await userModel.findOne({ email });

  if (!user) {
    user = await userModel.create({
      email,
      googleId: profile.id,
      fullname: profile.displayName || email.split("@")[0],
      verified: true,
    });
  } else if (!user.verified) {
    user.verified = true;
    await user.save();
  }

  const token = generateToken(String(user._id));

  res.cookie("token", token, getAuthCookieOptions(req));
  res.redirect(getFrontendUrl(req));
});

// @desc    Resend verification email
// @route   POST /api/auth/resend-verification
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await userModel.findOne({ email });

  if (!user) return res.status(404).json({ message: "User not found", success: false });
  if (user.verified) return res.status(400).json({ message: "Already verified", success: false });

  const verifyToken = jwt.sign({ email: user.email }, config.JWT_SECRET, { expiresIn: "1h" });
  const verifyUrl = `${getBackendUrl(req)}/api/auth/verify-email?token=${verifyToken}`;

  await sendEmail({
    to: email,
    subject: "Verify your Zorviq account",
    html: getVerificationEmail(verifyUrl),
  });

  res.json({ message: "Verification email resent", success: true });
});

// @desc    Logout user
// @route   POST /api/auth/logout
export const logoutUser = asyncHandler(async (req, res) => {
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (token) {
    try {
      const decoded = verifyJwt(token);
      if (redisClient && decoded.exp) {
        const expireTime = decoded.exp - Math.floor(Date.now() / 1000);
        if (expireTime > 0) {
          await redisClient.set(`bl_${token}`, "blocked", "EX", expireTime);
        }
      }
    } catch (error) {
      console.warn("Logout token blocklist skipped:", getErrorMessage(error));
    }
  }

  res.clearCookie("token", getClearCookieOptions(req));
  res.status(200).json({ message: "Logged out successfully", success: true });
});
