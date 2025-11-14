import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OllamaService } from './ollama.service';
import { AIRouterService } from './ai-router.service';
import { AIToolsService } from './ai-tools.service';
import { AIAssistantService } from './ai-assistant.service';
import { AIController } from './ai.controller';
import { LeadsModule } from '../leads/leads.module';
import { JobsModule } from '../jobs/jobs.module';
import { TasksModule } from '../tasks/tasks.module';
import { ContactsModule } from '../contacts/contacts.module';

@Module({
  imports: [
    HttpModule,
    LeadsModule,
    JobsModule,
    TasksModule,
    ContactsModule,
  ],
  controllers: [AIController],
  providers: [
    OllamaService,
    AIRouterService,
    AIToolsService,
    AIAssistantService,
  ],
  exports: [AIAssistantService, OllamaService, AIToolsService],
})
export class AIModule {}
