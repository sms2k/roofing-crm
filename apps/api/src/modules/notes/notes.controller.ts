import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotesService } from './notes.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';
import { UserId } from '../../common/decorators/user.decorator';

@ApiTags('notes')
@Controller('notes')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all notes' })
  findAll(@TenantId() tenantId: string, @Query('relatedToId') relatedToId?: string) {
    return this.notesService.findAll(tenantId, relatedToId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new note' })
  create(@TenantId() tenantId: string, @UserId() userId: string, @Body() data: any) {
    return this.notesService.create(tenantId, userId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a note' })
  update(@Param('id') id: string, @Body() data: any) {
    return this.notesService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a note' })
  delete(@Param('id') id: string) {
    return this.notesService.delete(id);
  }
}
