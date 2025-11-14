import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('properties')
@Controller('properties')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all properties' })
  findAll(@TenantId() tenantId: string) {
    return this.propertiesService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get property by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.propertiesService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new property' })
  create(@TenantId() tenantId: string, @Body() data: any) {
    return this.propertiesService.create(tenantId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a property' })
  update(@Param('id') id: string, @Body() data: any) {
    return this.propertiesService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a property' })
  delete(@Param('id') id: string) {
    return this.propertiesService.delete(id);
  }
}
