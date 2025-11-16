import { Module } from '@nestjs/common';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { PrismaService } from '../../prisma/prisma.service';

@Module({
  controllers: [CustomerPortalController],
  providers: [CustomerPortalService, PrismaService],
  exports: [CustomerPortalService],
})
export class CustomerPortalModule {}
