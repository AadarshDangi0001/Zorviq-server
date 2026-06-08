import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RagService } from '../../src/services/rag.service.js';
import type { RateLimiterService } from '../../src/services/rateLimiter.service.js';

const mocks = vi.hoisted(() => ({
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  cacheDel: vi.fn(),
  enqueueGeneration: vi.fn(),
  getQueueHealth: vi.fn(),
  generationCreate: vi.fn(),
  generationFindMemoryByProject: vi.fn(),
  generationFailStaleActiveForUser: vi.fn(),
  generationCountActive: vi.fn(),
  projectFindOne: vi.fn(),
  retrieveRelevantMemories: vi.fn(),
  buildProjectMemoryContext: vi.fn(),
}));

vi.mock('../../src/config/redis.js', () => ({
  redis: {
    get: mocks.redisGet,
    set: mocks.redisSet,
  },
}));

vi.mock('../../src/services/cache.service.js', () => ({
  CACHE_KEYS: {
    projectList: (userId: string) => `projects:${userId}`,
    projectDetail: (userId: string, projectId: string) => `projects:${userId}:${projectId}`,
  },
  cacheService: {
    del: mocks.cacheDel,
  },
}));

vi.mock('../../src/queue/generation.queue.js', () => ({
  CACHE_TTL: {
    job: 3600,
    prompt: 3600,
  },
  REDIS_KEYS: {
    jobStatus: (jobId: string) => `job:${jobId}:status`,
  },
  buildPromptCacheKey: () => 'pc:test-cache-key',
  buildRequestHash: () => 'test-request-hash',
  enqueueGeneration: mocks.enqueueGeneration,
  getQueueHealth: mocks.getQueueHealth,
}));

vi.mock('../../src/repositories/generation.repository.js', () => ({
  generationRepository: {
    create: mocks.generationCreate,
    findMemoryByProject: mocks.generationFindMemoryByProject,
    failStaleActiveForUser: mocks.generationFailStaleActiveForUser,
    countActive: mocks.generationCountActive,
  },
}));

vi.mock('../../src/repositories/project.repository.js', () => ({
  projectRepository: {
    findOne: mocks.projectFindOne,
    updateCode: vi.fn(),
  },
}));

vi.mock('../../src/services/projectMemory.service.js', () => ({
  buildProjectMemoryContext: mocks.buildProjectMemoryContext,
  projectMemoryService: {
    retrieveRelevantMemories: mocks.retrieveRelevantMemories,
    rememberGeneration: vi.fn(),
  },
}));

vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GenerationService', () => {
  const userId = '507f1f77bcf86cd799439011';
  const projectId = '507f1f77bcf86cd799439012';
  const generationId = '507f1f77bcf86cd799439013';

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.projectFindOne.mockResolvedValue({
      _id: projectId,
      userId,
      currentCode: '<main><h1>Existing project</h1></main>',
    });
    mocks.generationFailStaleActiveForUser.mockResolvedValue(0);
    mocks.generationCountActive.mockResolvedValue(0);
    mocks.getQueueHealth.mockReturnValue({ pending: 0, running: 0, isHealthy: true });
    mocks.redisGet.mockResolvedValue(null);
    mocks.generationFindMemoryByProject.mockResolvedValue([]);
    mocks.retrieveRelevantMemories.mockResolvedValue([]);
    mocks.buildProjectMemoryContext.mockReturnValue({
      context: '[PROJECT_MEMORY]\nCurrent saved project HTML/code from MongoDB:\nExisting project',
      searchText: 'Existing project',
      signature: 'memory-signature',
      recentCount: 0,
      semanticCount: 0,
      currentCodeIncluded: true,
    });
    mocks.generationCreate.mockResolvedValue({
      _id: { toString: () => generationId },
    });
    mocks.enqueueGeneration.mockResolvedValue(undefined);
    mocks.redisSet.mockResolvedValue('OK');
  });

  it('retrieves RAG chunks and queues the augmented prompt for generate requests', async () => {
    const { GenerationService } = await import('../../src/services/generation.service.js');
    const retrieveComponents = vi
      .fn()
      .mockResolvedValue(['<section>Reference component</section>']);
    const buildAugmentedPrompt = vi
      .fn()
      .mockReturnValue('AUGMENTED PROMPT WITH REFERENCE COMPONENT');
    const rag = {
      retrieveComponents,
      buildAugmentedPrompt,
    } as unknown as RagService;
    const rateLimiter = {
      check: vi.fn().mockResolvedValue(undefined),
    } as unknown as RateLimiterService;

    const service = new GenerationService(rag, rateLimiter);
    const result = await service.enqueue(userId, projectId, 'Create a pricing page');

    expect(result).toMatchObject({
      jobId: generationId,
      status: 'queued',
      cached: false,
    });
    expect(retrieveComponents).toHaveBeenCalledWith(
      expect.stringContaining('Create a pricing page')
    );
    expect(buildAugmentedPrompt).toHaveBeenCalledWith(
      expect.stringContaining('Create a pricing page'),
      ['<section>Reference component</section>']
    );
    expect(mocks.generationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        userId,
        prompt: 'Create a pricing page',
        augmentedPrompt: 'AUGMENTED PROMPT WITH REFERENCE COMPONENT',
        ragChunksUsed: 1,
      })
    );
    expect(mocks.enqueueGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        generationId,
        projectId,
        userId,
        augmentedPrompt: 'AUGMENTED PROMPT WITH REFERENCE COMPONENT',
      })
    );
  });
});
