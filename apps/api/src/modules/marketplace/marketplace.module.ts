import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
