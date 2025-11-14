import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JobsService } from './jobs.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { JobStatus } from '@roofing-crm/database';

@ApiTags('jobs')
@Controller('jobs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all jobs' })
  findAll(@TenantId() tenantId: string, @Query('status') status?: JobStatus) {
    return this.jobsService.findAll(tenantId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.jobsService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new job' })
  create(@TenantId() tenantId: string, @Body() data: any) {
    return this.jobsService.create(tenantId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a job' })
  update(@Param('id') id: string, @Body() data: any) {
    return this.jobsService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a job' })
  delete(@Param('id') id: string) {
    return this.jobsService.delete(id);
  }
}
