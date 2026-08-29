import { Module } from '@nestjs/common';

import { LibraryModule } from '../library/library.module';
import { ValidateService } from './validate.service';

@Module({
  imports: [LibraryModule],
  providers: [ValidateService],
  exports: [ValidateService],
})
export class ValidateModule {}
