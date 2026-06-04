import { logger } from '../lib/logger.js';
import { embeddingAnalysisService } from './embeddingAnalysis.service.js';

interface PineconeHit {
  _score?: number;
  fields?: {
    html?: string;
    code?: string;
    chunk_text?: string;
    title?: string;
  };
}

interface PineconeSearchResponse {
  result?: {
    hits?: PineconeHit[];
  };
}

export class RagService {
  private readonly pineconeApiKey = process.env.PINECONE_API_KEY ?? '';
  private readonly pineconeHost = process.env.PINECONE_INDEX_HOST ?? '';
  private readonly pineconeNamespace = process.env.PINECONE_COMPONENT_NAMESPACE ?? 'components';
  private readonly pineconeApiVersion = process.env.PINECONE_API_VERSION ?? '2026-04';
  private readonly minScore = Number(process.env.PINECONE_COMPONENT_THRESHOLD ?? '0.72');

  async retrieveComponents(prompt: string): Promise<string[]> {
    if (!this.pineconeApiKey || !this.pineconeHost || !process.env.GEMINI_API_KEY) {
      logger.info('rag.disabled', {
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
        hasPineconeKey: Boolean(this.pineconeApiKey),
        hasPineconeHost: Boolean(this.pineconeHost),
      });
      return [];
    }

    try {
      const queryText = `task: code retrieval | query: ${prompt}`;
      const vector = await embeddingAnalysisService.embedText(queryText);
      const hits = await this.searchComponents(vector);
      return hits
        .filter((hit) => (hit._score ?? 0) >= this.minScore)
        .map((hit) => hit.fields?.html ?? hit.fields?.code ?? hit.fields?.chunk_text ?? '')
        .filter((chunk) => chunk.trim().length > 0)
        .slice(0, 5);
    } catch (error) {
      logger.warn('rag.retrieve_failed', { error });
      return [];
    }
  }

  buildAugmentedPrompt(userPrompt: string, chunks: string[]): string {
    const generationContract = [
      'Generate clean, semantic HTML5 with Tailwind CSS utility classes.',
      'Write valid, unescaped output.',
      'Include all dependencies in the HTML file.',
      'Every tag must be properly closed.',
      'No syntax errors.',
      'No escaped characters.',
    ].join(' ');

    if (chunks.length === 0) {
      return [generationContract, '', '--- User request ---', userPrompt].join('\n');
    }

    return [
      generationContract,
      '',
      `Here are ${chunks.length} semantically matched reference components.`,
      'Use them for structure and dependency awareness, but write original HTML.',
      '',
      ...chunks.map((html, i) => `--- Reference ${i + 1} ---\n${html}`),
      '',
      '--- User request ---',
      userPrompt,
    ].join('\n');
  }

  private async searchComponents(vector: number[]): Promise<PineconeHit[]> {
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
        fields: ['title', 'html', 'code', 'chunk_text'],
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinecone component search failed: ${response.status}`);
    }

    const data = (await response.json()) as PineconeSearchResponse;
    return data.result?.hits ?? [];
  }
}

export const ragService = new RagService();
