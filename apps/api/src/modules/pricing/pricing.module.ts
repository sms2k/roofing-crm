import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingService } from './pricing.service';
import { ProductsService } from './products.service';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [PricingController],
  providers: [PricingService, ProductsService, CatalogService],
  exports: [PricingService, ProductsService, CatalogService],
})
export class PricingModule {}
