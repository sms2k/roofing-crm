import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../database/database.module';
import { EmailService } from './email.service';
import { EmailTemplatesService } from './email-templates.service';
import { EmailCampaignsService } from './email-campaigns.service';
import { EmailController } from './email.controller';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [EmailController],
  providers: [EmailService, EmailTemplatesService, EmailCampaignsService],
  exports: [EmailService, EmailTemplatesService, EmailCampaignsService],
})
export class EmailModule {}
