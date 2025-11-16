import { Module } from '@nestjs/common';
import { TemplateLibraryService } from './template-library.service';
import { TemplateLibraryController } from './template-library.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TemplateLibraryController],
  providers: [TemplateLibraryService],
  exports: [TemplateLibraryService],
})
export class TemplateLibraryModule {}
