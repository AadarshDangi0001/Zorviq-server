import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { RagService } from '../../src/services/rag.service.js';
import * as envConfig from '../../src/config/env.js';

// Mock the embeddingAnalysisService
vi.mock('../../src/services/embeddingAnalysis.service.js', () => ({
  embeddingAnalysisService: {
    embedText: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../src/lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('RAG Service', () => {
  let ragService: RagService;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    ragService = new RagService();
    
    // Store original fetch
    originalFetch = global.fetch;
    
    // Mock fetch
    fetchMock = vi.fn();
    global.fetch = fetchMock as any;

    // Mock config values
    vi.spyOn(envConfig.config, 'GEMINI_API_KEY', 'get').mockReturnValue('mock-gemini-key');
    vi.spyOn(envConfig.config, 'PINECONE_API_KEY', 'get').mockReturnValue('mock-pinecone-key');
    vi.spyOn(envConfig.config, 'PINECONE_INDEX_HOST', 'get').mockReturnValue('https://pinecone.example.com');
    vi.spyOn(envConfig.config, 'PINECONE_COMPONENT_NAMESPACE', 'get').mockReturnValue('components');
    vi.spyOn(envConfig.config, 'PINECONE_API_VERSION', 'get').mockReturnValue('2024-10');
    vi.spyOn(envConfig.config, 'PINECONE_COMPONENT_THRESHOLD', 'get').mockReturnValue(0.7);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('buildAugmentedPrompt', () => {
    it('should build prompt without reference chunks', () => {
      const userPrompt = 'Create a hero section with blue background';
      const chunks: string[] = [];

      const result = ragService.buildAugmentedPrompt(userPrompt, chunks);

      expect(result).toContain('Generate clean, semantic HTML5 with Tailwind CSS utility classes');
      expect(result).toContain(userPrompt);
      expect(result).toContain('--- User request ---');
      expect(result).not.toContain('Reference');
    });

    it('should build prompt with single reference chunk', () => {
      const userPrompt = 'Create a premium button';
      const chunks = ['<button class="px-4 py-2 bg-blue-600">Premium</button>'];

      const result = ragService.buildAugmentedPrompt(userPrompt, chunks);

      expect(result).toContain('Here are 1 semantically matched reference components');
      expect(result).toContain('--- Reference 1 ---');
      expect(result).toContain(chunks[0]);
      expect(result).toContain(userPrompt);
    });

    it('should build prompt with multiple reference chunks', () => {
      const userPrompt = 'Create a complete landing page';
      const chunks = [
        '<nav class="bg-white">Navigation</nav>',
        '<section class="hero">Hero Section</section>',
        '<footer class="bg-gray-800">Footer</footer>',
      ];

      const result = ragService.buildAugmentedPrompt(userPrompt, chunks);

      expect(result).toContain('Here are 3 semantically matched reference components');
      expect(result).toContain('--- Reference 1 ---');
      expect(result).toContain('--- Reference 2 ---');
      expect(result).toContain('--- Reference 3 ---');
      chunks.forEach((chunk) => {
        expect(result).toContain(chunk);
      });
    });

    it('should include all generation contracts in prompt', () => {
      const userPrompt = 'Test';
      const result = ragService.buildAugmentedPrompt(userPrompt, []);

      const contracts = [
        'Generate clean, semantic HTML5 with Tailwind CSS utility classes',
        'Write valid, unescaped output',
        'Include all dependencies in the HTML file',
        'Every tag must be properly closed',
        'No syntax errors',
        'No escaped characters',
      ];

      contracts.forEach((contract) => {
        expect(result).toContain(contract);
      });
    });
  });

  describe('retrieveComponents', () => {
    it('should return empty array when GEMINI_API_KEY is not configured', async () => {
      vi.spyOn(envConfig.config, 'GEMINI_API_KEY', 'get').mockReturnValue(undefined as any);

      const result = await ragService.retrieveComponents('test prompt');

      expect(result).toEqual([]);
    });

    it('should return empty array when PINECONE_API_KEY is not configured', async () => {
      vi.spyOn(envConfig.config, 'PINECONE_API_KEY', 'get').mockReturnValue(undefined as any);

      const result = await ragService.retrieveComponents('test prompt');

      expect(result).toEqual([]);
    });

    it('should return empty array when PINECONE_INDEX_HOST is not configured', async () => {
      vi.spyOn(envConfig.config, 'PINECONE_INDEX_HOST', 'get').mockReturnValue(undefined as any);

      const result = await ragService.retrieveComponents('test prompt');

      expect(result).toEqual([]);
    });

    it('should retrieve and filter components by score threshold', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            hits: [
              {
                _score: 0.95,
                fields: { html: '<div>High score component</div>' },
              },
              {
                _score: 0.5,
                fields: { html: '<div>Low score component</div>' },
              },
              {
                _score: 0.85,
                fields: { code: 'const example = "code component"' },
              },
            ],
          },
        }),
      });

      const result = await ragService.retrieveComponents('create a component');

      // Should include high-score (0.95) and medium-high score (0.85), exclude low score (0.5)
      expect(result.length).toBeLessThanOrEqual(5);
      expect(result).toContain('<div>High score component</div>');
      expect(result).toContain('const example = "code component"');
      expect(result).not.toContain('<div>Low score component</div>');
    });

    it('should use html field when available', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            hits: [
              {
                _score: 0.9,
                fields: {
                  html: '<button>HTML Button</button>',
                  code: 'const code = "should not use this"',
                },
              },
            ],
          },
        }),
      });

      const result = await ragService.retrieveComponents('button');

      expect(result[0]).toBe('<button>HTML Button</button>');
    });

    it('should fallback to code field when html is not available', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            hits: [
              {
                _score: 0.9,
                fields: {
                  code: 'const example = "code"',
                  chunk_text: 'should not use this',
                },
              },
            ],
          },
        }),
      });

      const result = await ragService.retrieveComponents('code');

      expect(result[0]).toBe('const example = "code"');
    });

    it('should fallback to chunk_text when other fields are not available', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            hits: [
              {
                _score: 0.9,
                fields: {
                  chunk_text: 'This is chunk text content',
                },
              },
            ],
          },
        }),
      });

      const result = await ragService.retrieveComponents('chunk');

      expect(result[0]).toBe('This is chunk text content');
    });

    it('should limit results to maximum 5 components', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            hits: Array.from({ length: 10 }, (_, i) => ({
              _score: 0.9 - i * 0.01,
              fields: { html: `<div>Component ${i}</div>` },
            })),
          },
        }),
      });

      const result = await ragService.retrieveComponents('test');

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should filter out empty strings', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: {
            hits: [
              {
                _score: 0.9,
                fields: { html: '   ' },
              },
              {
                _score: 0.85,
                fields: { html: '<div>Valid</div>' },
              },
            ],
          },
        }),
      });

      const result = await ragService.retrieveComponents('test');

      expect(result).toEqual(['<div>Valid</div>']);
    });

    it('should handle Pinecone API errors gracefully', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await ragService.retrieveComponents('test');

      expect(result).toEqual([]);
    });

    it('should handle embedding service errors gracefully', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');

      vi.mocked(embeddingAnalysisService.embedText).mockRejectedValue(
        new Error('Embedding service failed')
      );

      const result = await ragService.retrieveComponents('test');

      expect(result).toEqual([]);
    });

    it('should include task context in embedding query', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ result: { hits: [] } }),
      });

      await ragService.retrieveComponents('create button');

      expect(embeddingAnalysisService.embedText).toHaveBeenCalledWith(
        'task: code retrieval | query: create button'
      );
    });

    it('should handle null/undefined hits from Pinecone', async () => {
      const { embeddingAnalysisService } = await import('../../src/services/embeddingAnalysis.service.js');
      const mockVector = [0.1, 0.2, 0.3];

      vi.mocked(embeddingAnalysisService.embedText).mockResolvedValue(mockVector);

      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ result: {} }),
      });

      const result = await ragService.retrieveComponents('test');

      expect(result).toEqual([]);
    });
  });
});
