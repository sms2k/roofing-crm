import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MulterModule } from '@nestjs/platform-express';
import { DroneService } from './drone.service';
import { DroneController } from './drone.controller';
import { DatabaseModule } from '../database/database.module';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [
    DatabaseModule,
    AIModule,
    HttpModule,
    MulterModule.register({
      dest: './uploads/drone',
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max file size
      },
    }),
  ],
  controllers: [DroneController],
  providers: [DroneService],
  exports: [DroneService],
})
export class DroneModule {}
