import { Module } from '@nestjs/common';

import { ArtifactWriterService } from './artifact-writer.service';
import { ProjectLocatorService } from './project-locator.service';

@Module({
  providers: [ProjectLocatorService, ArtifactWriterService],
  exports: [ProjectLocatorService, ArtifactWriterService],
})
export class ProjectModule {}
