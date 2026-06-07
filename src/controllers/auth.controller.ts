import type { CookieOptions, Request, Response } from 'express';
import type { Profile as GoogleProfile } from 'passport-google-oauth20';
import { getFrontendUrl, getBackendUrl } from '../config/env.js';
import asyncHandler from '../utils/asyncHandler.js';
import type { UserDocument } from '../models/User.model.js';
import * as authService from '../services/auth.service.js';

/**
 * Get auth cookie options based on environment
 */
const getAuthCookieOptions = (req: Request): CookieOptions => {
  const host = req.headers.host || '';
  const isLocalBackend = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
  const isHttpsRequest =
    req.secure || req.headers['x-forwarded-proto'] === 'https' || !isLocalBackend;

  return {
    httpOnly: true,
    secure: isHttpsRequest,
    sameSite: isHttpsRequest ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
};

/**
 * Get clear cookie options
 */
const getClearCookieOptions = (req: Request): CookieOptions => {
  const { maxAge: _maxAge, ...options } = getAuthCookieOptions(req);
  return options;
};

/**
 * Send token response
 */
const sendTokenResponse = (
  user: ReturnType<typeof authService.getCurrentUser>,
  token: string,
  req: Request,
  res: Response,
  message: string
) => {
  res.cookie('token', token, getAuthCookieOptions(req));

  res.status(200).json({
    message,
    success: true,
    data: { token, user },
  });
};

// ============ ROUTE HANDLERS ============

/**
 * @desc    Register user
 * @route   POST /api/auth/register
 * @access  Public
 */
export const register = asyncHandler(async (req, res) => {
  const { email, contact, password, fullname } = req.body;
  const backendUrl = getBackendUrl(req);

  const { user, message } = await authService.registerUser(
    email,
    password,
    fullname,
    contact,
    backendUrl
  );

  res.status(201).json({
    message,
    success: true,
    data: { user },
  });
});

/**
 * @desc    Verify email
 * @route   GET /api/auth/verify-email
 * @access  Public
 */
export const verifyEmail = asyncHandler(async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';

  await authService.verifyUserEmail(token);

  res.redirect(`${getFrontendUrl(req)}/login`);
});

/**
 * @desc    Login user
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { user, token } = await authService.loginUser(email, password);

  sendTokenResponse(user, token, req, res, 'Login successful');
});

/**
 * @desc    Get current user
 * @route   GET /api/auth/get-me
 * @access  Private
 */
export const getMe = asyncHandler(async (req, res) => {
  const user = req.user as UserDocument | undefined;
  const userData = authService.getCurrentUser(user);

  res.status(200).json({
    success: true,
    data: { user: userData },
  });
});

/**
 * @desc    Forgot password
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const frontendUrl = getFrontendUrl(req);

  await authService.sendPasswordResetEmail(email, frontendUrl);

  res.json({
    message: 'If an account exists for this email, a password reset link has been sent.',
    success: true,
  });
});

/**
 * @desc    Reset password
 * @route   POST /api/auth/reset-password
 * @access  Public
 */
export const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.body;
  const newPassword = req.body.newPassword ?? req.body.password;

  await authService.resetUserPassword(token, newPassword);

  res.json({ message: 'Password reset successful', success: true });
});

/**
 * @desc    Google auth callback
 * @route   GET /api/auth/google/callback
 * @access  Public
 */
export const googleCallback = asyncHandler(async (req, res) => {
  const profile = req.user as GoogleProfile | undefined;

  const { token } = await authService.handleGoogleAuth(profile);

  res.cookie('token', token, getAuthCookieOptions(req));
  res.redirect(`${getFrontendUrl(req)}/dashboard`);
});

/**
 * @desc    Resend verification email
 * @route   POST /api/auth/resend-verification
 * @access  Public
 */
export const resendVerification = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const backendUrl = getBackendUrl(req);

  await authService.resendVerificationEmail(email, backendUrl);

  res.json({ message: 'Verification email resent', success: true });
});

/**
 * @desc    Logout user
 * @route   GET|POST /api/auth/logout
 * @access  Private
 */
export const logoutUser = asyncHandler(async (req, res) => {
  const token = authService.getTokenFromRequest(req) || undefined;

  await authService.logoutUser(token);

  res.clearCookie('token', getClearCookieOptions(req));
  res.status(200).json({ message: 'Logged out successfully', success: true });
});
