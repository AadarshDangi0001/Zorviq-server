import { logger } from '../lib/logger.js';

export interface EmbeddingAnalysisIssue {
  severity: 'error' | 'warning';
  message: string;
  source: 'local' | 'pinecone';
  score?: number;
}

export interface EmbeddingAnalysisResult {
  enabled: boolean;
  issues: EmbeddingAnalysisIssue[];
}

interface GeminiEmbeddingResponse {
  embedding?: {
    values?: number[];
  };
  embeddings?: Array<{
    values?: number[];
  }>;
}

interface PineconeSearchHit {
  _score?: number;
  fields?: {
    severity?: string;
    message?: string;
    pattern?: string;
    chunk_text?: string;
  };
}

interface PineconeSearchResponse {
  result?: {
    hits?: PineconeSearchHit[];
  };
}

const LOCAL_PATTERN_ISSUES: Array<{
  pattern: RegExp;
  severity: 'error' | 'warning';
  message: string;
}> = [
  {
    pattern: /\\n|\\"/,
    severity: 'error',
    message: 'Output contains escaped newline or quote sequences.',
  },
  {
    pattern: /hover:scale-103\b/,
    severity: 'warning',
    message: 'Output contains invalid Tailwind scale syntax.',
  },
  {
    pattern: /<script[^>]+src=["'](?:script|main|app)\.js["']/i,
    severity: 'error',
    message: 'Output references a local script file that will not exist in a standalone HTML file.',
  },
  {
    pattern: /<\/ul>\s*<\/ul>/i,
    severity: 'warning',
    message: 'Output may contain a duplicate closing list tag.',
  },
];

export class EmbeddingAnalysisService {
  private readonly geminiApiKey = process.env.GEMINI_API_KEY ?? '';
  private readonly geminiModel = process.env.GEMINI_EMBEDDING_MODEL ?? 'gemini-embedding-2';
  private readonly pineconeApiKey = process.env.PINECONE_API_KEY ?? '';
  private readonly pineconeHost = process.env.PINECONE_INDEX_HOST ?? '';
  private readonly pineconeNamespace = process.env.PINECONE_NAMESPACE ?? 'code-pattern-errors';
  private readonly pineconeApiVersion = process.env.PINECONE_API_VERSION ?? '2026-04';
  private readonly similarityThreshold = Number(process.env.PINECONE_PATTERN_THRESHOLD ?? '0.78');

  async analyze(code: string): Promise<EmbeddingAnalysisResult> {
    const issues = this.detectLocalPatternIssues(code);

    if (!this.geminiApiKey || !this.pineconeApiKey || !this.pineconeHost) {
      return {
        enabled: false,
        issues,
      };
    }

    try {
      const vector = await this.embed(code);
      const semanticIssues = await this.searchPatternIndex(vector);
      return {
        enabled: true,
        issues: [...issues, ...semanticIssues],
      };
    } catch (error) {
      logger.warn('embedding_analysis.failed', { error });
      return {
        enabled: false,
        issues,
      };
    }
  }

  async embedText(text: string): Promise<number[]> {
    if (!this.geminiApiKey) {
      throw new Error('GEMINI_API_KEY is required for embeddings.');
    }

    return this.embed(text);
  }

  private detectLocalPatternIssues(code: string): EmbeddingAnalysisIssue[] {
    return LOCAL_PATTERN_ISSUES.filter((issue) => issue.pattern.test(code)).map((issue) => ({
      severity: issue.severity,
      message: issue.message,
      source: 'local',
    }));
  }

  private async embed(text: string): Promise<number[]> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.geminiModel}:embedContent`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.geminiApiKey,
      },
      body: JSON.stringify({
        model: `models/${this.geminiModel}`,
        content: {
          parts: [
            {
              text: text.slice(0, 20_000),
            },
          ],
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini embedding request failed: ${response.status}`);
    }

    const data = (await response.json()) as GeminiEmbeddingResponse;
    const values = data.embedding?.values ?? data.embeddings?.[0]?.values;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error('Gemini embedding response did not include vector values.');
    }

    return values;
  }

  private async searchPatternIndex(vector: number[]): Promise<EmbeddingAnalysisIssue[]> {
    const host = this.pineconeHost.replace(/\/+$/, '');
    const endpoint = `${host}/records/namespaces/${encodeURIComponent(
      this.pineconeNamespace
    )}/search`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Api-Key': this.pineconeApiKey,
        'X-Pinecone-Api-Version': this.pineconeApiVersion,
      },
      body: JSON.stringify({
        query: {
          vector: {
            values: vector,
          },
          top_k: 5,
        },
        fields: ['severity', 'message', 'pattern', 'chunk_text'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinecone pattern search failed: ${response.status}`);
    }

    const data = (await response.json()) as PineconeSearchResponse;
    return (data.result?.hits ?? [])
      .filter((hit) => (hit._score ?? 0) >= this.similarityThreshold)
      .map((hit) => {
        const severity = hit.fields?.severity === 'error' ? 'error' : 'warning';
        return {
          severity,
          message:
            hit.fields?.message ??
            hit.fields?.pattern ??
            hit.fields?.chunk_text ??
            'Generated code resembles a known problematic pattern.',
          source: 'pinecone',
          score: hit._score,
        };
      });
  }
}

export const embeddingAnalysisService = new EmbeddingAnalysisService();
