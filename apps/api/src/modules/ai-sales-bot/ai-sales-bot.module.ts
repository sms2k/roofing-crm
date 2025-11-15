import { Module } from '@nestjs/common';
import { AiSalesBotService } from './ai-sales-bot.service';
import { AiSalesBotController } from './ai-sales-bot.controller';
import { AiSalesBotGateway } from './ai-sales-bot.gateway';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AIModule],
  controllers: [AiSalesBotController],
  providers: [AiSalesBotService, AiSalesBotGateway],
  exports: [AiSalesBotService],
})
export class AiSalesBotModule {}
