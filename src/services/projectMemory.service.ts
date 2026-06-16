import crypto from 'crypto';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';
import type { GenerationStatus } from '../models/Generation.model.js';
import { embeddingAnalysisService } from './embeddingAnalysis.service.js';

export interface GenerationMemoryRecord {
  _id?: unknown;
  prompt: string;
  output?: string | null;
  status: GenerationStatus;
  isSectionEdit?: boolean;
  sectionId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SemanticMemory {
  id: string;
  score: number;
  text: string;
  prompt?: string;
  generationId?: string;
  createdAt?: string;
}

export interface ProjectMemoryContext {
  context: string;
  searchText: string;
  signature: string;
  recentCount: number;
  semanticCount: number;
  currentCodeIncluded: boolean;
}

interface RememberGenerationInput {
  generationId: string;
  userId: string;
  projectId: string;
  prompt: string;
  output: string;
  isSectionEdit: boolean;
  sectionId: string | null;
}

interface BuildContextInput {
  currentCode?: string | null;
  recentGenerations: GenerationMemoryRecord[];
  semanticMemories: SemanticMemory[];
}

interface PineconeQueryMatch {
  id?: string;
  score?: number;
  metadata?: {
    memoryText?: string;
    prompt?: string;
    generationId?: string;
    createdAt?: string;
  };
}

interface PineconeQueryResponse {
  matches?: PineconeQueryMatch[];
}

const RECENT_TURNS = 3;
const CURRENT_CODE_LIMIT = 50_000;
const OUTPUT_EXCERPT_LIMIT = 800;
const PROMPT_EXCERPT_LIMIT = 400;
const MEMORY_TEXT_LIMIT = 4_000;
const VECTOR_ID_PREFIX = 'project-memory';

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function truncateEnd(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength)}...`;
}

function truncateMiddle(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;

  const half = Math.floor((maxLength - 31) / 2);
  return `${trimmed.slice(0, half)}\n... [middle omitted] ...\n${trimmed.slice(-half)}`;
}

function recordId(record: GenerationMemoryRecord): string {
  const id = record._id;
  if (id && typeof id === 'object' && 'toString' in id) return id.toString();
  return typeof id === 'string' ? id : '';
}

function memoryVectorId(userId: string, projectId: string, generationId: string): string {
  return `${VECTOR_ID_PREFIX}:${userId}:${projectId}:${generationId}`;
}

export function buildProjectMemoryText(input: RememberGenerationInput): string {
  const scope = input.isSectionEdit
    ? `Section edit${input.sectionId ? ` for ${input.sectionId}` : ''}`
    : 'Full page generation';

  return truncateEnd(
    [
      `User request: ${normalize(input.prompt)}`,
      `Scope: ${scope}`,
      'Generated result excerpt:',
      truncateMiddle(input.output, 3_000),
    ].join('\n'),
    MEMORY_TEXT_LIMIT
  );
}

function formatRecentTurn(record: GenerationMemoryRecord, index: number): string {
  const lines = [
    `Turn ${index + 1} (${record.status}${record.isSectionEdit ? ', section edit' : ''}):`,
    `User asked: ${truncateEnd(normalize(record.prompt), PROMPT_EXCERPT_LIMIT)}`,
  ];

  if (record.status === 'done' && record.output) {
    lines.push('Result excerpt:');
    lines.push(truncateMiddle(record.output, OUTPUT_EXCERPT_LIMIT));
  } else if (record.status === 'failed') {
    lines.push('Result: failed; use only the user intent, not any failed output.');
  } else {
    lines.push('Result: still in progress; treat as weak context.');
  }

  return lines.join('\n');
}

function buildSignature(input: BuildContextInput): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        currentCode: input.currentCode ?? null,
        recent: input.recentGenerations.map((record) => ({
          id: recordId(record),
          prompt: record.prompt,
          status: record.status,
          output: record.status === 'done' ? record.output ?? null : null,
          isSectionEdit: record.isSectionEdit ?? false,
          sectionId: record.sectionId ?? null,
          updatedAt: record.updatedAt?.toISOString?.() ?? null,
        })),
        semantic: input.semanticMemories.map((memory) => ({
          id: memory.id,
          score: Number(memory.score.toFixed(4)),
          text: memory.text,
        })),
      })
    )
    .digest('hex');
}

export function buildProjectMemoryContext(input: BuildContextInput): ProjectMemoryContext {
  const recent = input.recentGenerations.slice(0, RECENT_TURNS);
  const currentCode = input.currentCode?.trim() ?? '';
  const semantic = input.semanticMemories;

  const sections: string[] = [
    '[PROJECT_MEMORY]',
    'Use this to understand follow-up requests and project continuity. The latest user request remains the source of truth.',
  ];

  if (recent.length > 0) {
    sections.push('', 'Short-term recent project history from MongoDB (newest first):');
    sections.push(...recent.map(formatRecentTurn));
  }

  if (semantic.length > 0) {
    sections.push('', 'Long-term semantic memories from vector DB:');
    sections.push(
      ...semantic.map(
        (memory, index) =>
          `Memory ${index + 1} (score ${memory.score.toFixed(3)}):\n${memory.text}`
      )
    );
  }

  if (currentCode.length > 0) {
    sections.push('', 'Current saved project HTML/code from MongoDB:');
    sections.push(truncateMiddle(currentCode, CURRENT_CODE_LIMIT));
  }

  const hasContext = recent.length > 0 || semantic.length > 0 || currentCode.length > 0;
  const context = hasContext ? sections.join('\n') : '';
  const searchText = [
    ...recent.map((record) => record.prompt),
    ...semantic.map((memory) => memory.text),
    currentCode ? truncateMiddle(currentCode, 3_000) : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    context,
    searchText,
    signature: buildSignature(input),
    recentCount: recent.length,
    semanticCount: semantic.length,
    currentCodeIncluded: currentCode.length > 0,
  };
}

export class ProjectMemoryService {
  private readonly pineconeApiKey = config.PINECONE_API_KEY;
  private readonly pineconeHost = config.PINECONE_INDEX_HOST;
  private readonly pineconeNamespace = config.PINECONE_MEMORY_NAMESPACE;
  private readonly pineconeApiVersion = config.PINECONE_API_VERSION;
  private readonly minScore = config.PINECONE_MEMORY_THRESHOLD;

  isEnabled(): boolean {
    return Boolean(this.pineconeApiKey && this.pineconeHost && config.GEMINI_API_KEY);
  }

  async retrieveRelevantMemories(
    userId: string,
    projectId: string,
    queryText: string
  ): Promise<SemanticMemory[]> {
    if (!this.isEnabled()) {
      logger.info('project_memory.disabled', {
        hasGeminiKey: Boolean(config.GEMINI_API_KEY),
        hasPineconeKey: Boolean(this.pineconeApiKey),
        hasPineconeHost: Boolean(this.pineconeHost),
      });
      return [];
    }

    try {
      const vector = await embeddingAnalysisService.embedText(
        `task: project memory retrieval | query: ${queryText}`
      );
      return await this.queryMemories(userId, projectId, vector);
    } catch (error) {
      logger.warn('project_memory.retrieve_failed', { error, userId, projectId });
      return [];
    }
  }

  async rememberGeneration(input: RememberGenerationInput): Promise<void> {
    if (!this.isEnabled()) return;

    const memoryText = buildProjectMemoryText(input);

    try {
      const vector = await embeddingAnalysisService.embedText(
        `task: project memory storage | memory: ${memoryText}`
      );
      await this.upsertMemory(input, memoryText, vector);
    } catch (error) {
      logger.warn('project_memory.remember_failed', {
        error,
        generationId: input.generationId,
        projectId: input.projectId,
      });
    }
  }

  private async queryMemories(
    userId: string,
    projectId: string,
    vector: number[]
  ): Promise<SemanticMemory[]> {
    const host = this.pineconeHost.replace(/\/+$/, '');
    const endpoint = `${host}/query`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Api-Key': this.pineconeApiKey,
        'X-Pinecone-Api-Version': this.pineconeApiVersion,
      },
      body: JSON.stringify({
        namespace: this.pineconeNamespace,
        vector,
        topK: 5,
        includeMetadata: true,
        includeValues: false,
        filter: {
          userId: { $eq: userId },
          projectId: { $eq: projectId },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinecone memory query failed: ${response.status}`);
    }

    const data = (await response.json()) as PineconeQueryResponse;
    return (data.matches ?? [])
      .filter((match) => (match.score ?? 0) >= this.minScore)
      .map((match) => ({
        id: match.id ?? '',
        score: match.score ?? 0,
        text: match.metadata?.memoryText ?? '',
        prompt: match.metadata?.prompt,
        generationId: match.metadata?.generationId,
        createdAt: match.metadata?.createdAt,
      }))
      .filter((memory) => memory.id && memory.text.trim().length > 0);
  }

  private async upsertMemory(
    input: RememberGenerationInput,
    memoryText: string,
    vector: number[]
  ): Promise<void> {
    const host = this.pineconeHost.replace(/\/+$/, '');
    const endpoint = `${host}/vectors/upsert`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Api-Key': this.pineconeApiKey,
        'X-Pinecone-Api-Version': this.pineconeApiVersion,
      },
      body: JSON.stringify({
        namespace: this.pineconeNamespace,
        vectors: [
          {
            id: memoryVectorId(input.userId, input.projectId, input.generationId),
            values: vector,
            metadata: {
              userId: input.userId,
              projectId: input.projectId,
              generationId: input.generationId,
              prompt: truncateEnd(normalize(input.prompt), PROMPT_EXCERPT_LIMIT),
              memoryText,
              isSectionEdit: input.isSectionEdit,
              sectionId: input.sectionId ?? '',
              createdAt: new Date().toISOString(),
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Pinecone memory upsert failed: ${response.status}`);
    }

    logger.info('project_memory.upserted', {
      generationId: input.generationId,
      projectId: input.projectId,
      namespace: this.pineconeNamespace,
    });
  }
}

export const projectMemoryService = new ProjectMemoryService();
