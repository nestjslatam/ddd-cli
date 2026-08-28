import { Module } from '@nestjs/common';

import { LlmProviderFactory } from './llm-provider.factory';

/**
 * Providers are built per invocation by the factory rather than registered as
 * singletons, because which one to use depends on command-line flags that are
 * not known at module construction time.
 */
@Module({
  providers: [LlmProviderFactory],
  exports: [LlmProviderFactory],
})
export class LlmModule {}
