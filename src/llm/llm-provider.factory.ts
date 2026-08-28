import { Injectable, Logger } from '@nestjs/common';
import { LlmProvider } from './llm-provider.port';
import { AnthropicProvider } from './providers/anthropic.provider';
import { OpenAiProvider } from './providers/openai.provider';

export interface ProviderSelection {
  /** Provider id, or undefined to auto-detect from the environment. */
  provider?: string;
  /** Model override. Falls back to the provider's default. */
  model?: string;
}

interface Registration {
  /** Env var whose presence means this provider is usable. */
  credential: string;
  defaultModel: string;
  build: (model: string) => LlmProvider;
}

const REGISTRY: Record<string, Registration> = {
  anthropic: {
    credential: 'ANTHROPIC_API_KEY',
    defaultModel: 'claude-opus-5',
    build: (model) => new AnthropicProvider(model),
  },
  openai: {
    credential: 'OPENAI_API_KEY',
    defaultModel: 'gpt-5',
    build: (model) => new OpenAiProvider(model),
  },
};

@Injectable()
export class LlmProviderFactory {
  private readonly logger = new Logger(LlmProviderFactory.name);

  /** Provider ids in preference order for auto-detection. */
  static readonly PREFERENCE = ['anthropic', 'openai'] as const;

  create(selection: ProviderSelection = {}): LlmProvider {
    const id = selection.provider ?? this.detect();
    const registration = REGISTRY[id];

    if (!registration) {
      throw new Error(
        `Unknown provider "${id}". Available: ${Object.keys(REGISTRY).join(', ')}.`,
      );
    }

    const model = selection.model ?? registration.defaultModel;
    this.logger.debug(`Using provider ${id} with model ${model}`);
    return registration.build(model);
  }

  /**
   * Picks the first provider with credentials present.
   *
   * Anthropic is checked in a way that tolerates `ant auth login` profiles,
   * where no API key env var is set but the SDK still authenticates.
   */
  private detect(): string {
    for (const id of LlmProviderFactory.PREFERENCE) {
      if (process.env[REGISTRY[id].credential]) {
        return id;
      }
    }

    if (process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_PROFILE) {
      return 'anthropic';
    }

    throw new Error(
      'No model provider credentials found. Set ANTHROPIC_API_KEY or ' +
        'OPENAI_API_KEY, or pass --provider explicitly.',
    );
  }
}
