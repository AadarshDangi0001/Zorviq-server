import { describe, expect, it } from 'vitest';
import {
  buildProjectMemoryContext,
  buildProjectMemoryText,
} from '../../src/services/projectMemory.service.js';

describe('project memory helpers', () => {
  it('builds compact memory text for vector storage', () => {
    const memoryText = buildProjectMemoryText({
      generationId: 'gen1',
      userId: 'user1',
      projectId: 'project1',
      prompt: 'Keep the brand color emerald and make the hero premium',
      output: '<main><section><h1>Premium emerald hero</h1></section></main>',
      isSectionEdit: false,
      sectionId: null,
    });

    expect(memoryText).toContain('Keep the brand color emerald');
    expect(memoryText).toContain('Full page generation');
    expect(memoryText).toContain('Premium emerald hero');
  });

  it('combines recent DB history with semantic vector memories', () => {
    const context = buildProjectMemoryContext({
      currentCode: '<main><button class="bg-emerald-600">Start</button></main>',
      recentGenerations: [
        {
          prompt: 'Make CTA emerald',
          output: '<button class="bg-emerald-600">Start</button>',
          status: 'done',
        },
      ],
      semanticMemories: [
        {
          id: 'memory1',
          score: 0.82,
          text: 'User prefers emerald brand color and premium SaaS style.',
        },
      ],
    });

    expect(context.context).toContain('Short-term recent project history');
    expect(context.context).toContain('Long-term semantic memories from vector DB');
    expect(context.context).toContain('User prefers emerald brand color');
    expect(context.searchText).toContain('Make CTA emerald');
    expect(context.semanticCount).toBe(1);
    expect(context.currentCodeIncluded).toBe(true);
  });
});
