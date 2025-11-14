import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async check() {
    // Check database connection
    try {
      await this.db.$queryRaw`SELECT 1`;
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
      };
    }

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      version: '0.1.0',
    };
  }

  @Get('ping')
  @ApiOperation({ summary: 'Ping endpoint' })
  ping() {
    return { message: 'pong', timestamp: new Date().toISOString() };
  }
}
