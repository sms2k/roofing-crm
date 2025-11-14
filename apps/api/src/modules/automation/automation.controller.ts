import { Controller, Post, Get, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { AutomationService } from './automation.service';

@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('workflows')
  async createWorkflow(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      description?: string;
      trigger: any;
      actions: any[];
      enabled?: boolean;
    },
  ) {
    const tenantId = req.tenantId || 'default';
    const userId = req.user?.id || req.body.userId;
    return this.automationService.createWorkflow(tenantId, userId, body);
  }

  @Get('workflows')
  async getWorkflows(@Req() req: any, @Query('enabled') enabled?: string) {
    const tenantId = req.tenantId || 'default';
    return this.automationService.getWorkflows(tenantId, {
      enabled: enabled !== undefined ? enabled === 'true' : undefined,
    });
  }

  @Get('workflows/:workflowId')
  async getWorkflow(@Param('workflowId') workflowId: string) {
    return this.automationService.getWorkflow(workflowId);
  }

  @Put('workflows/:workflowId')
  async updateWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() body: any,
  ) {
    return this.automationService.updateWorkflow(workflowId, body);
  }

  @Delete('workflows/:workflowId')
  async deleteWorkflow(@Param('workflowId') workflowId: string) {
    return this.automationService.deleteWorkflow(workflowId);
  }

  @Post('workflows/:workflowId/execute')
  async executeWorkflow(
    @Param('workflowId') workflowId: string,
    @Body() body: { triggerData: any },
  ) {
    return this.automationService.executeWorkflow(workflowId, body.triggerData);
  }

  @Post('trigger')
  async triggerWorkflow(
    @Req() req: any,
    @Body() body: { triggerType: string; data: any },
  ) {
    const tenantId = req.tenantId || 'default';
    return this.automationService.triggerWorkflow(
      tenantId,
      body.triggerType as any,
      body.data,
    );
  }

  @Get('executions')
  async getExecutionHistory(
    @Req() req: any,
    @Query('workflowId') workflowId?: string,
  ) {
    const tenantId = req.tenantId || 'default';
    return this.automationService.getExecutionHistory(tenantId, workflowId);
  }

  @Get('stats')
  async getExecutionStats(@Req() req: any) {
    const tenantId = req.tenantId || 'default';
    return this.automationService.getExecutionStats(tenantId);
  }
}
