import type { Request, Response } from 'express';
import { getFrontendUrl } from '../config/env.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getAuthenticatedUserId } from '../utils/requestUser.js';
import * as githubService from '../services/github.service.js';

export const connectGitHub = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : undefined;
  const frontendUrl = getFrontendUrl(req);
  const state = githubService.createGitHubConnectState(userId, returnTo, frontendUrl);
  const authorizeUrl = githubService.getGitHubAuthorizationUrl(state);

  const wantsJson =
    req.query.json === '1' ||
    req.headers.accept?.includes('application/json') ||
    req.headers['x-requested-with'] === 'XMLHttpRequest';

  if (wantsJson) {
    res.status(200).json({
      success: true,
      data: { authorizeUrl },
    });
    return;
  }

  res.redirect(authorizeUrl);
});

export const githubCallback = async (req: Request, res: Response): Promise<void> => {
  const frontendUrl = getFrontendUrl(req);

  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code || !state) {
      res.redirect(`${frontendUrl}/?github=error`);
      return;
    }

    const { returnTo } = await githubService.completeGitHubConnection(code, state);
    const separator = returnTo.includes('?') ? '&' : '?';

    res.redirect(`${frontendUrl}${returnTo}${separator}github=connected`);
  } catch {
    res.redirect(`${frontendUrl}/?github=error`);
  }
};

export const getGitHubStatus = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const status = await githubService.getGitHubStatus(userId);

  res.status(200).json({
    success: true,
    data: status,
  });
});

export const createGitHubRepository = asyncHandler(async (req: Request, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  const { projectId } = req.params;
  const isPrivate = req.body?.private === true;

  const result = await githubService.createProjectRepository(userId, projectId, {
    private: isPrivate,
  });

  res.status(201).json({
    success: true,
    message: 'GitHub repository created successfully',
    data: result,
  });
});
