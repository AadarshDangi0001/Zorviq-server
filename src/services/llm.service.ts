
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../lib/logger.js";
import { ServiceUnavailableError } from "../lib/apiError.js";
 

export const SYSTEM_PROMPT = `You are an expert UI/UX designer and front-end developer.
Your ONLY output is raw HTML using Tailwind CSS utility classes.
 
STRICT RULES — violating any rule is a critical failure:
1. Output raw HTML ONLY. No markdown. No code fences. No explanations. No comments before or after HTML.
2. Every direct child of your output MUST have a unique data-section-id attribute.
   Use descriptive slugs: data-section-id="hero", data-section-id="features", data-section-id="pricing-cards" etc.
3. Use semantic HTML5 elements: <header>, <nav>, <section>, <main>, <footer>, <article>.
4. NEVER include <html>, <head>, <body>, or <script> tags — your output is injected directly into a page.
5. NEVER include inline event handlers (onclick, onload, onerror, onmouseover).
6. All images must use: <img src="https://picsum.photos/seed/{descriptive-keyword}/800/400" alt="..." class="...">
7. All layouts must be mobile-first and responsive using Tailwind sm:, md:, lg: prefixes.
8. Design must be visually striking: bold typography, real color choices, professional spacing.
   Use actual Tailwind color classes (bg-indigo-600, text-slate-900, etc.) — never grey placeholders.
9. Include hover states on interactive elements (hover:bg-indigo-700, hover:scale-105 etc).
10. Never use arbitrary Tailwind values like w-[347px] — use standard scale only.
 
SECTION EDIT MODE (activated when prompt contains [SECTION_EDIT]):
- Output ONLY the HTML for the single section being modified.
- ALWAYS preserve the section's existing data-section-id attribute value unchanged.
- Do NOT output any other sections or wrapper elements.
- Respect the edit instruction precisely.`;
 
interface StreamResult {
  fullOutput: string;
  tokenCount: number;
  durationMs: number;
}
 

// Circuit Breaker state (module-level singleton)

interface CircuitBreakerState {
  failures: number;
  isOpen: boolean;
  openedAt: number | null;
  readonly threshold: number;
  readonly cooldownMs: number;
}
 
const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  isOpen: false,
  openedAt: null,
  threshold: 3,
  cooldownMs: 30_000, // 30 seconds
};
 
function checkCircuit(): void {
  if (!circuitBreaker.isOpen) return;
 
  const elapsed = Date.now() - (circuitBreaker.openedAt ?? 0);
  if (elapsed >= circuitBreaker.cooldownMs) {
    // Half-open: allow one attempt through
    circuitBreaker.isOpen = false;
    circuitBreaker.failures = 0;
    circuitBreaker.openedAt = null;
    logger.info("llm.circuit_breaker.half_open");
    return;
  }
 
  const retryAfter = Math.ceil(
    (circuitBreaker.cooldownMs - elapsed) / 1000
  );
  throw new ServiceUnavailableError(
    `AI service temporarily unavailable. Retry in ${retryAfter}s.`
  );
}
 
function recordFailure(): void {
  circuitBreaker.failures++;
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.isOpen = true;
    circuitBreaker.openedAt = Date.now();
    logger.error("llm.circuit_breaker.opened", {
      failures: circuitBreaker.failures,
    });
  }
}
 
function recordSuccess(): void {
  if (circuitBreaker.failures > 0) {
    logger.info("llm.circuit_breaker.reset");
    circuitBreaker.failures = 0;
    circuitBreaker.isOpen = false;
    circuitBreaker.openedAt = null;
  }
}
 
// ─────────────────────────────────────────────
// LLM Service
// ─────────────────────────────────────────────
export class LLMService {
  private clients: Anthropic[];
  private currentIndex: number = 0;
  private readonly maxRetries: number = 2;
  private readonly model = "claude-sonnet-4-20250514";
  private readonly maxTokens = 8096;
 
  constructor() {
    const keys = [
      process.env.ANTHROPIC_API_KEY,
      process.env.ANTHROPIC_API_KEY_2,
    ].filter((k): k is string => typeof k === "string" && k.length > 0);
 
    if (keys.length === 0) {
      throw new Error("No Anthropic API keys configured");
    }
 
    this.clients = keys.map((apiKey) => new Anthropic({ apiKey }));
 
    logger.info("llm.service.initialized", {
      keyCount: this.clients.length,
      model: this.model,
    });
  }
 
  private nextClient(): Anthropic {
    const client = this.clients[this.currentIndex % this.clients.length];
    this.currentIndex++;
    return client;
  }
 
  /**
   * Core streaming method — yields tokens one at a time via async generator.
   * Handles retries internally. Circuit breaker prevents hammering a dead API.
   *
   * @yields Individual text tokens from Claude
   * @returns Final StreamResult with metadata
   */
  async *stream(
    augmentedPrompt: string,
    attempt = 0
  ): AsyncGenerator<string, StreamResult, unknown> {
    // Check circuit breaker before making any request
    checkCircuit();
 
    const client = this.nextClient();
    const startTime = Date.now();
    let fullOutput = "";
    let tokenCount = 0;
 
    try {
      logger.info("llm.stream.start", {
        attempt,
        promptLength: augmentedPrompt.length,
        model: this.model,
      });
 
      const stream = await client.messages.stream({
        model: this.model,
        max_tokens: this.maxTokens,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: augmentedPrompt }],
      });
 
      for await (const event of stream) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          const token = event.delta.text;
          fullOutput += token;
          recordSuccess(); // reset circuit on first successful token
          yield token;
        }
 
        if (event.type === "message_delta" && event.usage) {
          tokenCount = event.usage.output_tokens;
        }
      }
 
      const durationMs = Date.now() - startTime;
 
      logger.info("llm.stream.complete", {
        durationMs,
        tokenCount,
        outputLength: fullOutput.length,
        attempt,
      });
 
      return { fullOutput, tokenCount, durationMs };
    } catch (err: unknown) {
      const error = err as { status?: number; message?: string };
      const isRetryable =
        error.status === 529 || // overloaded
        error.status === 503 || // service unavailable
        error.status === 500 || // internal server error
        (error.status === undefined && fullOutput.length === 0); // connection error
 
      logger.warn("llm.stream.error", {
        attempt,
        status: error.status,
        message: error.message,
        isRetryable,
        outputSoFar: fullOutput.length,
      });
 
      if (isRetryable && attempt < this.maxRetries) {
        // Exponential back-off: 2s, 4s
        const delay = 2000 * Math.pow(2, attempt);
        logger.info("llm.stream.retrying", { delay, attempt: attempt + 1 });
        await new Promise((r) => setTimeout(r, delay));
 
        // Delegate to retry — caller gets a fresh generator
        yield* this.stream(augmentedPrompt, attempt + 1);
        return { fullOutput: "", tokenCount: 0, durationMs: 0 }; // unreachable but TS needs it
      }
 
      // 429 rate limit — always record failure
      if (error.status === 429) {
        recordFailure();
        throw new ServiceUnavailableError(
          "AI service rate limited. Please wait a moment and try again."
        );
      }
 
      // Max retries exceeded or non-retryable error
      recordFailure();
      throw err;
    }
  }
 
  /**
   * Get current circuit breaker state — exposed for health endpoint
   */
  getCircuitState(): {
    isOpen: boolean;
    failures: number;
    cooldownRemaining: number | null;
  } {
    return {
      isOpen: circuitBreaker.isOpen,
      failures: circuitBreaker.failures,
      cooldownRemaining: circuitBreaker.isOpen
        ? Math.max(
            0,
            Math.ceil(
              (circuitBreaker.cooldownMs -
                (Date.now() - (circuitBreaker.openedAt ?? 0))) /
                1000
            )
          )
        : null,
    };
  }
}
 
// Singleton — one LLMService for the whole process
export const llmService = new LLMService();