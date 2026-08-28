import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import {
  LlmProvider,
  StructuredRequest,
  TextRequest,
} from '../llm-provider.port';

/**
 * OpenAI adapter.
 *
 * Uses response_format json_schema with `strict: true`, the closest equivalent
 * to Claude's structured outputs. Strict mode requires every object to declare
 * `additionalProperties: false` and list every key in `required`, which zod's
 * JSON Schema output does not do for optional fields -- `harden` below closes
 * that gap so the same schema drives both providers.
 */
@Injectable()
export class OpenAiProvider extends LlmProvider {
  readonly id = 'openai';

  private readonly client: OpenAI;

  constructor(readonly model: string = 'gpt-5') {
    super();
    this.client = new OpenAI();
  }

  async generateStructured(request: StructuredRequest): Promise<unknown> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: harden(request.schema),
        },
      },
    });

    const text = completion.choices[0]?.message?.content;
    if (!text?.trim()) {
      throw new Error(`${this.model} returned an empty response.`);
    }

    return JSON.parse(text);
  }

  async generateText(request: TextRequest): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
    });

    const text = completion.choices[0]?.message?.content;
    if (!text?.trim()) {
      throw new Error(`${this.model} returned an empty response.`);
    }

    return text.trim();
  }
}

/**
 * Makes a JSON Schema acceptable to OpenAI strict mode: every object gets
 * `additionalProperties: false` and every declared property listed in
 * `required`. Optionality is preserved by the zod parse on the way out, so
 * widening `required` here does not weaken validation.
 */
export function harden(schema: unknown): Record<string, unknown> {
  if (Array.isArray(schema)) {
    return schema.map(harden) as unknown as Record<string, unknown>;
  }
  if (schema === null || typeof schema !== 'object') {
    return schema as Record<string, unknown>;
  }

  const node: Record<string, unknown> = { ...(schema as object) };

  for (const [key, value] of Object.entries(node)) {
    if (value && typeof value === 'object') {
      node[key] = harden(value);
    }
  }

  if (node.type === 'object' && node.properties) {
    node.additionalProperties = false;
    node.required = Object.keys(node.properties as Record<string, unknown>);
  }

  return node;
}
