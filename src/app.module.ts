import { Module } from '@nestjs/common';

import { GenerateAggregateCommand } from './commands/generate-aggregate.command';
import { GenerationModule } from './generation/generation.module';
import { LlmModule } from './llm/llm.module';
import { ProjectModule } from './project/project.module';

@Module({
  imports: [LlmModule, GenerationModule, ProjectModule],
  providers: [GenerateAggregateCommand],
})
export class AppModule {}
