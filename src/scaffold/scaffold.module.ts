import { Module } from '@nestjs/common';

import { LibraryModule } from '../library/library.module';
import { ScaffoldService } from './scaffold.service';

@Module({
  imports: [LibraryModule],
  providers: [ScaffoldService],
  exports: [ScaffoldService],
})
export class ScaffoldModule {}
