import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [DatabaseModule, AIModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
