/**
 * The port every model provider implements.
 *
 * Deliberately narrow: one call that takes a system prompt, a user prompt and a
 * JSON Schema, and returns parsed JSON. Everything domain-specific lives in the
 * planner, so adding a provider never means re-stating what a DDD aggregate is.
 */
export interface StructuredRequest {
  system: string;
  prompt: string;
  /** JSON Schema the response must satisfy. */
  schema: Record<string, unknown>;
  /** Name for the schema, surfaced to providers that require one. */
  schemaName: string;
}

export interface TextRequest {
  system: string;
  prompt: string;
}

export abstract class LlmProvider {
  /** Provider id used by `--provider` and by config. */
  abstract readonly id: string;

  /** Model this instance will call. */
  abstract readonly model: string;

  /**
   * Returns parsed JSON matching `schema`.
   *
   * Implementations must not attempt to validate the domain meaning of the
   * response -- the planner does that against the zod schema, so a provider
   * that ignores the JSON Schema fails there with a readable error rather than
   * silently producing something the renderers cannot use.
   */
  abstract generateStructured(request: StructuredRequest): Promise<unknown>;

  /**
   * Returns prose. Used for explanation, where a schema would only get in the
   * way of a readable answer.
   */
  abstract generateText(request: TextRequest): Promise<string>;
}

/** DI token. `LlmProvider` is abstract, so it doubles as the token. */
export const LLM_PROVIDER = LlmProvider;
