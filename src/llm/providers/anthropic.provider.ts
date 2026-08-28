import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { LlmProvider, StructuredRequest } from '../llm-provider.port';

/**
 * Claude adapter.
 *
 * Uses structured outputs (`output_config.format`), so the response is
 * constrained to the schema by the API rather than by prompt discipline, and
 * adaptive thinking, which suits the modelling judgement this task needs --
 * deciding aggregate boundaries and invariants is exactly the kind of work that
 * benefits from the model reasoning before answering.
 */
@Injectable()
export class AnthropicProvider extends LlmProvider {
  readonly id = 'anthropic';

  private readonly client: Anthropic;

  constructor(readonly model: string = 'claude-opus-5') {
    super();
    // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login`
    // profile, in that order. Passing a key explicitly is not required.
    this.client = new Anthropic();
  }

  async generateStructured(request: StructuredRequest): Promise<unknown> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: 'high',
        // JSONOutputFormat carries only type + schema; the schema name is an
        // OpenAI-side requirement and has no equivalent here.
        format: {
          type: 'json_schema',
          schema: request.schema,
        },
      },
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(
        `Claude declined this request${
          response.stop_details?.explanation
            ? `: ${response.stop_details.explanation}`
            : '.'
        }`,
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    if (!text.trim()) {
      throw new Error('Claude returned an empty response.');
    }

    return JSON.parse(text);
  }
}
