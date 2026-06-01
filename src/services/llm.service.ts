import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { logger } from "../lib/logger.js";
import { ServiceUnavailableError } from "../lib/apiError.js";
import { SYSTEM_PROMPT } from "../lib/systemPrompt.js";
 
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
  private client: BedrockRuntimeClient;
  private readonly maxRetries: number = 2;
  private readonly model = process.env.BEDROCK_MODEL_ID ?? "amazon.nova-pro-v1:0";
  private readonly inferenceProfileId = process.env.BEDROCK_INFERENCE_PROFILE_ID ?? "";
  private readonly maxTokens = 8096;
 
  constructor() {
    const region = process.env.AWS_REGION ?? "ap-south-1";
    this.client = new BedrockRuntimeClient({ region });
 
    logger.info("llm.service.initialized", {
      region,
      model: this.model,
      inferenceProfileId: this.inferenceProfileId || undefined,
    });
  }
 
  private async readResponseBody(body: unknown): Promise<string> {
    if (!body) return "";
    if (typeof body === "string") return body;
    if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
      return new TextDecoder().decode(body);
    }
    if (body instanceof ArrayBuffer) {
      return new TextDecoder().decode(new Uint8Array(body));
    }
 
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as AsyncIterable<Uint8Array | string>) {
      if (typeof chunk === "string") {
        chunks.push(new TextEncoder().encode(chunk));
      } else if (chunk instanceof Uint8Array) {
        chunks.push(chunk);
      } else if (typeof chunk === "number") {
        chunks.push(Uint8Array.of(chunk));
      }
    }
 
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
 
  private async parseBedrockResponse(response: { body?: unknown }): Promise<string> {
    const rawBody = await this.readResponseBody(response.body);
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      const output = parsed.output as Record<string, unknown> | undefined;
      const message = output?.message as Record<string, unknown> | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      const firstText = content?.find((item) => typeof item.text === "string")?.text as
        | string
        | undefined;
      return (
        firstText ??
        (parsed.outputText as string | undefined) ??
        (parsed.text as string | undefined) ??
        rawBody
      );
    } catch {
      return rawBody;
    }
  }
 
  private *chunkText(text: string, size = 32): Generator<string> {
    let index = 0;
    while (index < text.length) {
      yield text.slice(index, index + size);
      index += size;
    }
  }
 
  /**
   * Core streaming method — yields tokens one at a time via async generator.
   * Handles retries internally. Circuit breaker prevents hammering a dead API.
   *
   * @yields Individual text tokens from Bedrock Nova Pro
   * @returns Final StreamResult with metadata
   */
  async *stream(
    augmentedPrompt: string,
    attempt = 0
  ): AsyncGenerator<string, StreamResult, unknown> {
    // Check circuit breaker before making any request
    checkCircuit();
 
    const client = this.client;
    const startTime = Date.now();
    let fullOutput = "";
    let tokenCount = 0;
 
    try {
      logger.info("llm.stream.start", {
        attempt,
        promptLength: augmentedPrompt.length,
        model: this.model,
      });
 
      const command = new InvokeModelCommand({
        modelId: this.inferenceProfileId || this.model,
        body: new TextEncoder().encode(
          JSON.stringify({
            system: [{ text: SYSTEM_PROMPT }],
            messages: [
              {
                role: "user",
                content: [{ text: augmentedPrompt }],
              },
            ],
            inferenceConfig: {
              maxTokens: this.maxTokens,
            },
          })
        ),
        contentType: "application/json",
        accept: "application/json",
      });
 
      const response = await client.send(command);
      const output = await this.parseBedrockResponse(response);
      tokenCount = Math.ceil(output.length / 4);
 
      if (output.length > 0) {
        recordSuccess();
      }
 
      for (const chunk of this.chunkText(output, 32)) {
        fullOutput += chunk;
        yield chunk;
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
      const error = err as { status?: number; message?: string; name?: string };
      const isRequestMalformed =
        typeof error.message === "string" &&
        /Malformed input request/i.test(error.message);
      const requiresInferenceProfile =
        typeof error.message === "string" &&
        (/inference profile/i.test(error.message) ||
          /on-demand throughput/i.test(error.message));
      const isRetryable =
        !requiresInferenceProfile &&
        !isRequestMalformed &&
        (error.status === 529 || // overloaded
          error.status === 503 || // service unavailable
          error.status === 500 || // internal server error
          (error.status === undefined && fullOutput.length === 0)); // connection error
 
      logger.warn("llm.stream.error", {
        attempt,
        status: error.status,
        message: error.message,
        requiresInferenceProfile,
        isRequestMalformed,
        isRetryable,
        outputSoFar: fullOutput.length,
      });

      if (requiresInferenceProfile) {
        recordFailure();
        throw new ServiceUnavailableError(
          "Bedrock model requires an inference profile. Set BEDROCK_INFERENCE_PROFILE_ID or use a model that supports on-demand throughput."
        );
      }
 
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