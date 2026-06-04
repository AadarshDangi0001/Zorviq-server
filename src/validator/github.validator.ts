import { z } from 'zod';
import { objectIdString, validate } from './zod.validator.js';

const projectIdParamSchema = z.object({
  projectId: objectIdString('Invalid projectId format'),
});

const createRepositoryBodySchema = z
  .object({
    private: z.boolean().optional(),
  })
  .strict();

export const validateGitHubProjectIdParam = validate(projectIdParamSchema, 'params');
export const validateCreateGitHubRepositoryBody = validate(createRepositoryBodySchema, 'body');
