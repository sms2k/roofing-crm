import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { DatabaseModule } from '../database/database.module';
import { SmsService } from './sms.service';
import { SmsTemplatesService } from './sms-templates.service';
import { SmsCampaignsService } from './sms-campaigns.service';
import { SmsController } from './sms.controller';

@Module({
  imports: [ConfigModule, HttpModule, DatabaseModule],
  controllers: [SmsController],
  providers: [SmsService, SmsTemplatesService, SmsCampaignsService],
  exports: [SmsService, SmsTemplatesService, SmsCampaignsService],
})
export class SmsModule {}
