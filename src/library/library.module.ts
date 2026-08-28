import { Module } from '@nestjs/common';

import { LibraryIntrospectorService } from './library-introspector.service';

@Module({
  providers: [LibraryIntrospectorService],
  exports: [LibraryIntrospectorService],
})
export class LibraryModule {}
