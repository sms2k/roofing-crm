import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('contacts')
@Controller('contacts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all contacts' })
  findAll(@TenantId() tenantId: string) {
    return this.contactsService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.contactsService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new contact' })
  create(@TenantId() tenantId: string, @Body() data: any) {
    return this.contactsService.create(tenantId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a contact' })
  update(@Param('id') id: string, @TenantId() tenantId: string, @Body() data: any) {
    return this.contactsService.update(id, tenantId, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a contact' })
  delete(@Param('id') id: string) {
    return this.contactsService.delete(id);
  }
}
