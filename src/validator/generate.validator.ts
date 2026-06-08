import { z } from 'zod';
import { objectIdString, validate } from './zod.validator.js';

const enqueueSchema = z
  .object({
    projectId: objectIdString('Invalid projectId format'),

    prompt: z
      .string()
      .min(5, 'Prompt must be at least 5 characters')
      .max(2000, 'Prompt must not exceed 2000 characters')
      .transform((s) => s.trim()),

    isSectionEdit: z.boolean().optional().default(false),

    sectionId: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9-_]+$/, 'sectionId must be alphanumeric with hyphens or underscores')
      .optional()
      .nullable()
      .default(null),

    sectionHtml: z
      .string()
      .max(50_000, 'sectionHtml too large')
      .optional()
      .nullable()
      .default(null),
  })
  .refine(
    (data) => {
      if (data.isSectionEdit && !data.sectionId) return false;
      return true;
    },
    {
      message: 'sectionId is required when isSectionEdit is true',
      path: ['sectionId'],
    }
  );

const jobIdParamSchema = z.object({
  jobId: objectIdString('Invalid jobId format'),
});

const projectIdParamSchema = z.object({
  projectId: objectIdString('Invalid projectId format'),
});

export const validateEnqueueGeneration = validate(enqueueSchema);
export const validateJobIdParam = validate(jobIdParamSchema, 'params');
export const validateProjectIdParam = validate(projectIdParamSchema, 'params');
