import { Module } from '@nestjs/common';

import { ExplainCommand } from './commands/explain.command';
import { ExtendCommand } from './commands/extend.command';
import { GenerateAggregateCommand } from './commands/generate-aggregate.command';
import { ListCommand } from './commands/list.command';
import { NewCommand } from './commands/new.command';
import { ValidateCommand } from './commands/validate.command';
import { GenerationModule } from './generation/generation.module';
import { LibraryModule } from './library/library.module';
import { LlmModule } from './llm/llm.module';
import { ProjectModule } from './project/project.module';
import { ScaffoldModule } from './scaffold/scaffold.module';
import { UiModule } from './ui/ui.module';
import { ValidateModule } from './validate/validate.module';

@Module({
  imports: [
    UiModule,
    LlmModule,
    LibraryModule,
    GenerationModule,
    ProjectModule,
    ScaffoldModule,
    ValidateModule,
  ],
  providers: [
    GenerateAggregateCommand,
    ListCommand,
    ExplainCommand,
    NewCommand,
    ExtendCommand,
    ValidateCommand,
  ],
})
export class AppModule {}
