import { Module } from '@nestjs/common';
import { AiSalesCoachService } from './ai-sales-coach.service';
import { AiSalesCoachController } from './ai-sales-coach.controller';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AIModule],
  controllers: [AiSalesCoachController],
  providers: [AiSalesCoachService],
  exports: [AiSalesCoachService],
})
export class AiSalesCoachModule {}
