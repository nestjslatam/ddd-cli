import { Module } from '@nestjs/common';

import { ExplainCommand } from './commands/explain.command';
import { GenerateAggregateCommand } from './commands/generate-aggregate.command';
import { ListCommand } from './commands/list.command';
import { GenerationModule } from './generation/generation.module';
import { LibraryModule } from './library/library.module';
import { LlmModule } from './llm/llm.module';
import { ProjectModule } from './project/project.module';
import { UiModule } from './ui/ui.module';

@Module({
  imports: [
    UiModule,
    LlmModule,
    LibraryModule,
    GenerationModule,
    ProjectModule,
  ],
  providers: [GenerateAggregateCommand, ListCommand, ExplainCommand],
})
export class AppModule {}
