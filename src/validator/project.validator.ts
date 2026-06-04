import { z } from 'zod';
import { objectIdString, validate } from './zod.validator.js';

const idParamSchema = z.object({
  id: objectIdString('Invalid project ID format'),
});

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Project name must be at least 3 characters')
    .max(100, 'Project name must not exceed 100 characters'),
  currentCode: z.string().optional().nullable(),
});

const updateProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'Project name must be at least 3 characters')
    .max(100, 'Project name must not exceed 100 characters')
    .optional(),
  currentCode: z.string().optional().nullable(),
});

export const validateProjectIdParam = validate(idParamSchema, 'params');
export const validateCreateProject = validate(createProjectSchema);
export const validateUpdateProject = validate(updateProjectSchema);
