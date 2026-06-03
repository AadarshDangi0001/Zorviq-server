import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
  enqueueGeneration,
  streamGeneration,
  getGenerationStatus,
  getGenerationHistory,
} from "../controllers/generate.controller.js";
import {
  validateEnqueueGeneration,
  validateJobIdParam,
  validateProjectIdParam,
} from "../validator/generate.validator.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  validateEnqueueGeneration,
  enqueueGeneration
);


router.get(
  "/stream/:jobId",
  authMiddleware,
  validateJobIdParam,
  streamGeneration
);


router.get(
  "/status/:jobId",
  authMiddleware,
  validateJobIdParam,
  getGenerationStatus
);


router.get(
  "/history/:projectId",
  authMiddleware,
  validateProjectIdParam,
  getGenerationHistory
);

export { router as generateRouter };
