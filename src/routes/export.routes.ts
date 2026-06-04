import { Router } from 'express';
import { downloadProjectZip } from '../controllers/export.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validateExportProjectIdParam } from '../validator/export.validator.js';

const router = Router();

router.get('/:projectId', authMiddleware, validateExportProjectIdParam, downloadProjectZip);

export { router as exportRouter };
