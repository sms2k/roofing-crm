import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { LeadStatus } from '@roofing-crm/database';

@ApiTags('leads')
@Controller('leads')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all leads' })
  findAll(@TenantId() tenantId: string, @Query('status') status?: LeadStatus) {
    return this.leadsService.findAll(tenantId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get lead by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.leadsService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new lead' })
  create(@TenantId() tenantId: string, @Body() data: any) {
    return this.leadsService.create(tenantId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a lead' })
  update(@Param('id') id: string, @TenantId() tenantId: string, @Body() data: any) {
    return this.leadsService.update(id, tenantId, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a lead' })
  delete(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.leadsService.delete(id, tenantId);
  }
}
