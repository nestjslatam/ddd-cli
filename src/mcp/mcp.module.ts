import { Module } from '@nestjs/common';

import { GenerationModule } from '../generation/generation.module';
import { LibraryModule } from '../library/library.module';
import { ProjectModule } from '../project/project.module';
import { ScaffoldModule } from '../scaffold/scaffold.module';
import { ValidateModule } from '../validate/validate.module';
import { McpServerService } from './mcp-server.service';

@Module({
  imports: [
    LibraryModule,
    ScaffoldModule,
    GenerationModule,
    ProjectModule,
    ValidateModule,
  ],
  providers: [McpServerService],
  exports: [McpServerService],
})
export class McpModule {}
