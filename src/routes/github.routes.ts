import { Router, type RequestHandler } from 'express';
import {
  connectGitHub,
  createGitHubRepository,
  getGitHubStatus,
  githubCallback,
} from '../controllers/github.controller.js';
import { authenticateUser } from '../middleware/auth.middleware.js';
import {
  validateCreateGitHubRepositoryBody,
  validateGitHubProjectIdParam,
} from '../validator/github.validator.js';
import { isGitHubConfigured } from '../config/env.js';

const githubRouter = Router();

const githubNotConfigured: RequestHandler = (_req, res) => {
  res.status(503).json({ message: 'GitHub integration is not configured', success: false });
};

if (isGitHubConfigured) {
  /**
   * @route GET /api/github/connect
   * @description Start GitHub OAuth for the authenticated user
   * @access Private
   */
  githubRouter.get('/connect', authenticateUser, connectGitHub);

  /**
   * @route GET /api/github/callback
   * @description GitHub OAuth callback
   * @access Public
   */
  githubRouter.get('/callback', githubCallback);

  /**
   * @route GET /api/github/status
   * @description GitHub connection status for the authenticated user
   * @access Private
   */
  githubRouter.get('/status', authenticateUser, getGitHubStatus);

  /**
   * @route POST /api/github/repos/:projectId
   * @description Create a GitHub repository from a generated project
   * @access Private
   */
  githubRouter.post(
    '/repos/:projectId',
    authenticateUser,
    validateGitHubProjectIdParam,
    validateCreateGitHubRepositoryBody,
    createGitHubRepository
  );
} else {
  githubRouter.get('/connect', githubNotConfigured);
  githubRouter.get('/callback', githubNotConfigured);
  githubRouter.get('/status', githubNotConfigured);
  githubRouter.post('/repos/:projectId', githubNotConfigured);
}

export default githubRouter;
