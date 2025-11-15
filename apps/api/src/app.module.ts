import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

// Core modules
import { DatabaseModule } from './modules/database/database.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { LeadsModule } from './modules/leads/leads.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { NotesModule } from './modules/notes/notes.module';
import { HealthModule } from './modules/health/health.module';
import { AIModule } from './modules/ai/ai.module';
import { SmsModule } from './modules/sms/sms.module';
import { EmailModule } from './modules/email/email.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AiSalesCoachModule } from './modules/ai-sales-coach/ai-sales-coach.module';
import { AiProductionManagerModule } from './modules/ai-production-manager/ai-production-manager.module';
import { AiSalesBotModule } from './modules/ai-sales-bot/ai-sales-bot.module';
import { DroneModule } from './modules/drone/drone.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
      },
    ]),

    // Core modules
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    LeadsModule,
    ContactsModule,
    PropertiesModule,
    JobsModule,
    TasksModule,
    NotesModule,

    // AI & Advanced Features
    AIModule,
    AiSalesCoachModule,
    AiProductionManagerModule,
    AiSalesBotModule,

    // Communication
    SmsModule,
    EmailModule,
    NotificationsModule,
    MessagingModule,

    // Scheduling & Automation
    CalendarModule,
    AutomationModule,

    // Advanced Features
    DroneModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
