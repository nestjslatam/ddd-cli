import { Module } from '@nestjs/common';

import { AggregatePlannerService } from './aggregate-planner.service';
import { ArtifactGeneratorService } from './artifact-generator.service';

@Module({
  providers: [AggregatePlannerService, ArtifactGeneratorService],
  exports: [AggregatePlannerService, ArtifactGeneratorService],
})
export class GenerationModule {}
