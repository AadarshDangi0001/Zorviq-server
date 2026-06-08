import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import { config, isGitHubConfigured } from '../config/env.js';
import { getProjectFiles, toSafeFileName } from '../lib/projectFiles.js';
import {
  ApiError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../lib/apiError.js';
import { logger } from '../lib/logger.js';
import userModel from '../models/User.model.js';
import { userRepository } from '../repositories/user.repository.js';
import { projectService } from './project.service.js';
import { CACHE_KEYS, cacheService } from './cache.service.js';

const GITHUB_CONNECT_STATE_TYPE = 'github-connect';
const GITHUB_OAUTH_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_OAUTH_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_API_USER_URL = 'https://api.github.com/user';
const GITHUB_OAUTH_SCOPES = ['repo'];
const MAX_REPO_NAME_ATTEMPTS = 5;

type GitHubConnectState = jwt.JwtPayload & {
  userId: string;
  returnTo: string;
  typ: typeof GITHUB_CONNECT_STATE_TYPE;
};

type GitHubTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GitHubUserResponse = {
  login?: string;
  avatar_url?: string;
};

export type GitHubConnectionStatus = {
  githubConnected: boolean;
  githubUsername?: string;
  githubAvatar?: string;
};

const invalidateAuthUser = async (userId: string): Promise<void> => {
  await cacheService.del(CACHE_KEYS.authUser(userId));
};

const assertGitHubConfigured = (): void => {
  if (!isGitHubConfigured) {
    throw new ServiceUnavailableError('GitHub integration is not configured');
  }
};

const sanitizeReturnTo = (returnTo: string | undefined, frontendBaseUrl: string): string => {
  const fallback = '/';
  if (!returnTo?.trim()) {
    return fallback;
  }

  try {
    const base = new URL(frontendBaseUrl);
    const resolved = new URL(returnTo, base);
    if (resolved.origin !== base.origin) {
      return fallback;
    }

    return `${resolved.pathname}${resolved.search}${resolved.hash}` || fallback;
  } catch {
    return fallback;
  }
};

export const createGitHubConnectState = (
  userId: string,
  returnTo: string | undefined,
  frontendBaseUrl: string
): string => {
  const payload: GitHubConnectState = {
    userId,
    returnTo: sanitizeReturnTo(returnTo, frontendBaseUrl),
    typ: GITHUB_CONNECT_STATE_TYPE,
  };

  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '10m' });
};

const verifyGitHubConnectState = (state: string): GitHubConnectState => {
  try {
    const decoded = jwt.verify(state, config.JWT_SECRET);
    if (typeof decoded === 'string' || decoded.typ !== GITHUB_CONNECT_STATE_TYPE) {
      throw new ValidationError('Invalid GitHub OAuth state');
    }

    if (!decoded.userId) {
      throw new ValidationError('Invalid GitHub OAuth state');
    }

    return decoded as GitHubConnectState;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ValidationError('Invalid or expired GitHub OAuth state');
  }
};

export const getGitHubAuthorizationUrl = (state: string): string => {
  assertGitHubConfigured();

  const params = new URLSearchParams({
    client_id: config.GITHUB_CLIENT_ID,
    redirect_uri: config.GITHUB_CALLBACK_URL,
    scope: GITHUB_OAUTH_SCOPES.join(' '),
    state,
  });

  return `${GITHUB_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
};

const exchangeGitHubCode = async (code: string): Promise<string> => {
  const response = await fetch(GITHUB_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: config.GITHUB_CALLBACK_URL,
    }),
  });

  const data = (await response.json()) as GitHubTokenResponse;

  if (!response.ok || !data.access_token) {
    logger.error('github.oauth_token_exchange_failed', {
      status: response.status,
      error: data.error,
      errorDescription: data.error_description,
    });
    throw new ValidationError('Failed to connect GitHub account');
  }

  return data.access_token;
};

const fetchGitHubProfile = async (accessToken: string): Promise<GitHubUserResponse> => {
  const response = await fetch(GITHUB_API_USER_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
    },
  });

  const profile = (await response.json()) as GitHubUserResponse;

  if (!response.ok || !profile.login) {
    logger.error('github.profile_fetch_failed', { status: response.status });
    throw new ValidationError('Failed to read GitHub profile');
  }

  return profile;
};

export const completeGitHubConnection = async (
  code: string,
  state: string
): Promise<{ returnTo: string }> => {
  assertGitHubConfigured();

  const { userId, returnTo } = verifyGitHubConnectState(state);
  const accessToken = await exchangeGitHubCode(code);
  const profile = await fetchGitHubProfile(accessToken);

  const user = await userModel.findById(userId).select('+githubAccessToken').exec();
  if (!user) {
    throw new NotFoundError('User not found');
  }

  user.githubAccessToken = accessToken;
  user.githubConnected = true;
  user.githubUsername = profile.login;
  user.githubAvatar = profile.avatar_url;
  await userRepository.saveUser(user);
  await invalidateAuthUser(userId);

  return { returnTo };
};

export const getGitHubStatus = async (userId: string): Promise<GitHubConnectionStatus> => {
  const user = await userModel
    .findById(userId)
    .select('githubConnected githubUsername githubAvatar')
    .lean()
    .exec();

  if (!user) {
    throw new NotFoundError('User not found');
  }

  return {
    githubConnected: Boolean(user.githubConnected && user.githubUsername),
    githubUsername: user.githubUsername,
    githubAvatar: user.githubAvatar,
  };
};

const isRepoNameConflict = (error: unknown): boolean => {
  if (!(error instanceof Error) || !('status' in error)) {
    return false;
  }

  return (error as { status?: number }).status === 422;
};

const createRepositoryWithRetry = async (
  octokit: Octokit,
  baseName: string,
  description: string,
  isPrivate: boolean
): Promise<{ name: string; htmlUrl: string; owner: string }> => {
  let attempt = 0;

  while (attempt < MAX_REPO_NAME_ATTEMPTS) {
    const name = attempt === 0 ? baseName : `${baseName}-${attempt}`;
    try {
      const { data } = await octokit.repos.createForAuthenticatedUser({
        name,
        description,
        private: isPrivate,
        auto_init: false,
      });

      return {
        name: data.name,
        htmlUrl: data.html_url,
        owner: data.owner?.login ?? '',
      };
    } catch (error) {
      if (isRepoNameConflict(error)) {
        attempt += 1;
        continue;
      }

      logger.error('github.repo_create_failed', { baseName, attempt, error });
      throw new ServiceUnavailableError('Failed to create GitHub repository');
    }
  }

  throw new ValidationError(
    'A GitHub repository with this name already exists. Rename the project and try again.'
  );
};

const pushInitialCommit = async (
  octokit: Octokit,
  owner: string,
  repo: string,
  files: { path: string; content: string }[]
): Promise<void> => {
  const treeItems = await Promise.all(
    files.map(async (file) => {
      const { data } = await octokit.git.createBlob({
        owner,
        repo,
        content: Buffer.from(file.content, 'utf8').toString('base64'),
        encoding: 'base64',
      });

      return {
        path: file.path,
        mode: '100644' as const,
        type: 'blob' as const,
        sha: data.sha,
      };
    })
  );

  const { data: tree } = await octokit.git.createTree({
    owner,
    repo,
    tree: treeItems,
  });

  const { data: commit } = await octokit.git.createCommit({
    owner,
    repo,
    message: 'Initial commit from Zorviq',
    tree: tree.sha,
  });

  await octokit.git.createRef({
    owner,
    repo,
    ref: 'refs/heads/main',
    sha: commit.sha,
  });
};

export const createProjectRepository = async (
  userId: string,
  projectId: string,
  options?: { private?: boolean }
): Promise<{ repositoryUrl: string; repositoryName: string }> => {
  assertGitHubConfigured();

  const user = await userRepository.findByIdWithGithubToken(userId);
  if (!user?.githubConnected || !user.githubAccessToken || !user.githubUsername) {
    throw new ForbiddenError('Connect your GitHub account before deploying');
  }

  const project = await projectService.getProjectById(projectId, userId);
  const currentCode = project.currentCode?.trim();

  if (!currentCode) {
    throw new ValidationError('Project has no generated code to deploy.');
  }

  const files = getProjectFiles({
    projectName: project.name,
    currentCode,
  });

  const octokit = new Octokit({ auth: user.githubAccessToken });
  const baseRepoName = toSafeFileName(project.name).slice(0, 90);
  const description = `Generated by Zorviq — ${project.name}`;

  const { name, htmlUrl, owner } = await createRepositoryWithRetry(
    octokit,
    baseRepoName,
    description,
    options?.private ?? false
  );

  try {
    await pushInitialCommit(octokit, owner, name, files);
  } catch (error) {
    logger.error('github.initial_commit_failed', { owner, name, error });
    throw new ServiceUnavailableError('Repository was created but file upload failed');
  }

  return {
    repositoryUrl: htmlUrl,
    repositoryName: name,
  };
};
