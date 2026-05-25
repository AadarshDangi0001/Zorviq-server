import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/env.js";
import userModel from "../models/User.model.js";
import { redisClient } from "../config/redis.js";

type AuthTokenPayload = jwt.JwtPayload & {
  id?: string;
};

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : "Unknown error";
};

export const authenticateUser = async (req: Request, res: Response, next: NextFunction) => {
  // Accept from cookie OR Authorization: Bearer <token>
  let token = req.cookies?.token;
  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided", success: false });
  }

  try {
    // 1. Check Redis blocklist (for logged-out tokens)
    if (redisClient) {
      try {
        const isBlocked = await redisClient.get(`bl_${token}`);
        if (isBlocked) {
          return res.status(401).json({ message: "Unauthorized: Token is invalid", success: false });
        }
      } catch (redisErr) {
        console.warn("Redis check skipped (connection error):", getErrorMessage(redisErr));
      }
    }

    // 2. Verify JWT
    const decoded = jwt.verify(token, config.JWT_SECRET) as AuthTokenPayload;
    if (!decoded.id) {
      return res.status(401).json({ message: "Unauthorized: Invalid token payload", success: false });
    }

    // 3. Find User
    const user = await userModel.findById(decoded.id).select("-password"); // Exclude password for safety

    if (!user) {
      return res.status(401).json({ message: "Unauthorized: User not found", success: false });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", getErrorMessage(err));
    return res.status(401).json({ message: "Unauthorized: Invalid token", success: false });
  }
};

