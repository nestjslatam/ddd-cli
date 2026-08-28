import { Global, Module } from '@nestjs/common';

import { UiService } from './ui.service';

/**
 * Global: every command formats output, and threading it through each feature
 * module would be ceremony with no benefit.
 */
@Global()
@Module({
  providers: [UiService],
  exports: [UiService],
})
export class UiModule {}
