import { Router } from "express";
import {
  validateEmail,
  validateRegisterUser,
  validateLoginUser,
  validateResetPassword,
} from "../validator/auth.validator.js";
import {
  getMe,
  googleCallback,
  login,
  register,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  logoutUser
} from "../controllers/auth.controller.js";
import passport from "passport";
import type { RequestHandler } from "express";
import { config, isGoogleAuthConfigured } from "../config/env.js";
import { authenticateUser } from "../middleware/auth.middleware.js";

const authRouter = Router();
const googleAuthNotConfigured: RequestHandler = (_req, res) => {
  res.status(503).json({ message: "Google authentication is not configured", success: false });
};

/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access Public
 */
authRouter.post("/register", validateRegisterUser, register);

/**
 * @route POST /api/auth/login
 * @description Authenticate user & get token
 * @access Public
 */
authRouter.post("/login", validateLoginUser, login);

/**
 * @route GET /api/auth/verify-email
 * @description Verify user email address
 * @access Public
 */
authRouter.get("/verify-email", verifyEmail);

/**
 * @route POST /api/auth/resend-verification
 * @description Resend verification email
 * @access Public
 */
authRouter.post("/resend-verification", validateEmail, resendVerification);

/**
 * @route POST /api/auth/forgot-password
 * @description Send password reset email
 * @access Public
 */
authRouter.post("/forgot-password", validateEmail, forgotPassword);

/**
 * @route POST /api/auth/reset-password
 * @description Reset user password
 * @access Public
 */
authRouter.post("/reset-password", validateResetPassword, resetPassword);

/**
 * @route GET /api/auth/google
 * @description Authenticate with Google
 * @access Public
 */
if (isGoogleAuthConfigured) {
  authRouter.get(
    "/google",
    passport.authenticate("google", {
      scope: ["profile", "email"],
    }),
  );
} else {
  authRouter.get("/google", googleAuthNotConfigured);
}

/**
 * @route GET /api/auth/google/callback
 * @description Google authentication callback
 * @access Public
 */
if (isGoogleAuthConfigured) {
  authRouter.get(
    "/google/callback",
    passport.authenticate("google", {
      session: false,
      failureRedirect:
        config.NODE_ENV === "development"
          ? `${config.LOCAL_FRONTEND_URL}/login`
          : `${config.FRONTEND_URL}/login`,
    }),
    googleCallback,
  );
} else {
  authRouter.get("/google/callback", googleAuthNotConfigured);
}

/**
 * @route GET /api/auth/me
 * @description Get the authenticated user's profile
 * @access Private
 */
authRouter.get("/get-me", authenticateUser, getMe);

/**
 * @route GET|POST /api/auth/logout
 * @description Logout the authenticated user
 * @access Private
 */
authRouter.get("/logout", authenticateUser, logoutUser);
authRouter.post("/logout", authenticateUser, logoutUser);

export default authRouter;
