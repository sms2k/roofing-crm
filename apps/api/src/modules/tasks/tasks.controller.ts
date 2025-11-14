import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantId } from '../../common/decorators/tenant.decorator';

@ApiTags('tasks')
@Controller('tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Get all tasks' })
  findAll(@TenantId() tenantId: string) {
    return this.tasksService.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  findOne(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.tasksService.findOne(id, tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new task' })
  create(@TenantId() tenantId: string, @Body() data: any) {
    return this.tasksService.create(tenantId, data);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a task' })
  update(@Param('id') id: string, @Body() data: any) {
    return this.tasksService.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a task' })
  delete(@Param('id') id: string) {
    return this.tasksService.delete(id);
  }
}
