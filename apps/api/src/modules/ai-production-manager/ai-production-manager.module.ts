import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiProductionManagerService } from './ai-production-manager.service';
import { AiProductionManagerController } from './ai-production-manager.controller';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AIModule, HttpModule],
  controllers: [AiProductionManagerController],
  providers: [AiProductionManagerService],
  exports: [AiProductionManagerService],
})
export class AiProductionManagerModule {}
