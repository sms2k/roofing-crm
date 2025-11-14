import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SmsService } from '../sms/sms.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

export type TriggerType =
  | 'LEAD_CREATED'
  | 'LEAD_STATUS_CHANGED'
  | 'JOB_STATUS_CHANGED'
  | 'APPOINTMENT_SCHEDULED'
  | 'APPOINTMENT_REMINDER'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'TASK_CREATED'
  | 'TASK_OVERDUE'
  | 'SCHEDULED_TIME';

export type ActionType =
  | 'SEND_EMAIL'
  | 'SEND_SMS'
  | 'SEND_NOTIFICATION'
  | 'CREATE_TASK'
  | 'UPDATE_LEAD_STATUS'
  | 'UPDATE_JOB_STATUS'
  | 'ASSIGN_TO_USER'
  | 'ADD_TAG'
  | 'WEBHOOK'
  | 'WAIT';

export interface WorkflowTrigger {
  type: TriggerType;
  conditions?: Record<string, any>;
  schedule?: string; // Cron expression for scheduled triggers
}

export interface WorkflowAction {
  type: ActionType;
  config: Record<string, any>;
  delay?: number; // Delay in minutes before executing
}

export interface CreateWorkflowDto {
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  enabled?: boolean;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ===========================
  // Workflow Management
  // ===========================

  async createWorkflow(tenantId: string, userId: string, data: CreateWorkflowDto) {
    const workflow = await this.db.workflow.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description,
        trigger: data.trigger as any,
        actions: data.actions as any,
        enabled: data.enabled !== false,
        createdById: userId,
      },
    });

    this.logger.log(`Workflow created: ${workflow.name} (${workflow.id})`);

    return workflow;
  }

  async updateWorkflow(workflowId: string, data: Partial<CreateWorkflowDto>) {
    return this.db.workflow.update({
      where: { id: workflowId },
      data: {
        name: data.name,
        description: data.description,
        trigger: data.trigger as any,
        actions: data.actions as any,
        enabled: data.enabled,
      },
    });
  }

  async deleteWorkflow(workflowId: string) {
    return this.db.workflow.delete({
      where: { id: workflowId },
    });
  }

  async getWorkflows(tenantId: string, options?: { enabled?: boolean }) {
    const where: any = { tenantId };
    if (options?.enabled !== undefined) {
      where.enabled = options.enabled;
    }

    return this.db.workflow.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWorkflow(workflowId: string) {
    return this.db.workflow.findUnique({
      where: { id: workflowId },
    });
  }

  // ===========================
  // Workflow Execution
  // ===========================

  async triggerWorkflow(
    tenantId: string,
    triggerType: TriggerType,
    data: Record<string, any>,
  ) {
    // Find all enabled workflows for this trigger
    const workflows = await this.db.workflow.findMany({
      where: {
        tenantId,
        enabled: true,
        trigger: {
          path: ['type'],
          equals: triggerType,
        },
      },
    });

    this.logger.log(
      `Trigger ${triggerType}: Found ${workflows.length} workflows`,
    );

    const results = [];

    for (const workflow of workflows) {
      // Check if conditions match
      if (this.evaluateConditions(workflow.trigger as any, data)) {
        const result = await this.executeWorkflow(workflow.id, data);
        results.push(result);
      }
    }

    return results;
  }

  async executeWorkflow(workflowId: string, triggerData: Record<string, any>) {
    const workflow = await this.db.workflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow || !workflow.enabled) {
      throw new BadRequestException('Workflow not found or disabled');
    }

    // Create execution record
    const execution = await this.db.workflowExecution.create({
      data: {
        workflowId,
        tenantId: workflow.tenantId,
        status: 'RUNNING',
        triggerData: triggerData as any,
        startedAt: new Date(),
      },
    });

    this.logger.log(`Executing workflow: ${workflow.name} (${execution.id})`);

    const actions = workflow.actions as any as WorkflowAction[];
    const actionResults = [];

    try {
      for (const action of actions) {
        // Apply delay if specified
        if (action.delay) {
          await this.delay(action.delay * 60 * 1000); // Convert to ms
        }

        const result = await this.executeAction(
          workflow.tenantId,
          action,
          triggerData,
        );
        actionResults.push(result);
      }

      // Mark execution as completed
      await this.db.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          actionResults: actionResults as any,
        },
      });

      this.logger.log(`Workflow execution completed: ${execution.id}`);

      return { success: true, executionId: execution.id, actionResults };
    } catch (error) {
      this.logger.error(`Workflow execution failed: ${error.message}`);

      // Mark execution as failed
      await this.db.workflowExecution.update({
        where: { id: execution.id },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          error: error.message,
        },
      });

      return { success: false, executionId: execution.id, error: error.message };
    }
  }

  // ===========================
  // Action Execution
  // ===========================

  private async executeAction(
    tenantId: string,
    action: WorkflowAction,
    data: Record<string, any>,
  ) {
    this.logger.log(`Executing action: ${action.type}`);

    switch (action.type) {
      case 'SEND_EMAIL':
        return this.executeSendEmail(tenantId, action.config, data);

      case 'SEND_SMS':
        return this.executeSendSms(tenantId, action.config, data);

      case 'SEND_NOTIFICATION':
        return this.executeSendNotification(tenantId, action.config, data);

      case 'CREATE_TASK':
        return this.executeCreateTask(tenantId, action.config, data);

      case 'UPDATE_LEAD_STATUS':
        return this.executeUpdateLeadStatus(tenantId, action.config, data);

      case 'UPDATE_JOB_STATUS':
        return this.executeUpdateJobStatus(tenantId, action.config, data);

      case 'ASSIGN_TO_USER':
        return this.executeAssignToUser(tenantId, action.config, data);

      case 'ADD_TAG':
        return this.executeAddTag(tenantId, action.config, data);

      case 'WAIT':
        return this.executeWait(action.config);

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }

  private async executeSendEmail(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const to = this.resolveVariable(config.to, data);
    const subject = this.resolveVariable(config.subject, data);
    const html = this.resolveVariable(config.html, data);

    await this.emailService.sendEmail(tenantId, {
      to,
      subject,
      html,
    });

    return { action: 'SEND_EMAIL', to, subject };
  }

  private async executeSendSms(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const to = this.resolveVariable(config.to, data);
    const message = this.resolveVariable(config.message, data);

    await this.smsService.sendSms(tenantId, {
      to,
      message,
    });

    return { action: 'SEND_SMS', to };
  }

  private async executeSendNotification(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const userId = this.resolveVariable(config.userId, data);
    const title = this.resolveVariable(config.title, data);
    const message = this.resolveVariable(config.message, data);

    await this.notificationsService.send(tenantId, {
      userId,
      type: config.type || 'CUSTOM',
      title,
      message,
      priority: config.priority || 'MEDIUM',
      channels: config.channels || ['IN_APP'],
    });

    return { action: 'SEND_NOTIFICATION', userId, title };
  }

  private async executeCreateTask(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const title = this.resolveVariable(config.title, data);
    const description = this.resolveVariable(config.description, data);

    const task = await this.db.task.create({
      data: {
        tenantId,
        title,
        description,
        assignedToId: config.assignedToId,
        dueDate: config.dueDate ? new Date(config.dueDate) : undefined,
        priority: config.priority || 'MEDIUM',
      },
    });

    return { action: 'CREATE_TASK', taskId: task.id, title };
  }

  private async executeUpdateLeadStatus(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const leadId = data.leadId || config.leadId;
    const status = config.status;

    await this.db.lead.update({
      where: { id: leadId },
      data: { status },
    });

    return { action: 'UPDATE_LEAD_STATUS', leadId, status };
  }

  private async executeUpdateJobStatus(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const jobId = data.jobId || config.jobId;
    const status = config.status;

    await this.db.job.update({
      where: { id: jobId },
      data: { status },
    });

    return { action: 'UPDATE_JOB_STATUS', jobId, status };
  }

  private async executeAssignToUser(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const entityType = config.entityType; // 'lead' or 'job'
    const entityId = data[`${entityType}Id`] || config.entityId;
    const userId = config.userId;

    if (entityType === 'lead') {
      await this.db.lead.update({
        where: { id: entityId },
        data: { assignedToId: userId },
      });
    } else if (entityType === 'job') {
      await this.db.job.update({
        where: { id: entityId },
        data: { salesRepId: userId },
      });
    }

    return { action: 'ASSIGN_TO_USER', entityType, entityId, userId };
  }

  private async executeAddTag(
    tenantId: string,
    config: Record<string, any>,
    data: Record<string, any>,
  ) {
    const contactId = data.contactId || config.contactId;
    const tag = config.tag;

    const contact = await this.db.contact.findUnique({
      where: { id: contactId },
    });

    if (contact) {
      const tags = (contact.tags as string[]) || [];
      if (!tags.includes(tag)) {
        await this.db.contact.update({
          where: { id: contactId },
          data: { tags: [...tags, tag] },
        });
      }
    }

    return { action: 'ADD_TAG', contactId, tag };
  }

  private async executeWait(config: Record<string, any>) {
    const duration = config.duration || 0; // in minutes
    await this.delay(duration * 60 * 1000);
    return { action: 'WAIT', duration };
  }

  // ===========================
  // Helper Methods
  // ===========================

  private evaluateConditions(
    trigger: WorkflowTrigger,
    data: Record<string, any>,
  ): boolean {
    if (!trigger.conditions) {
      return true; // No conditions, always execute
    }

    // Simple condition evaluation
    for (const [key, value] of Object.entries(trigger.conditions)) {
      if (data[key] !== value) {
        return false;
      }
    }

    return true;
  }

  private resolveVariable(template: string, data: Record<string, any>): string {
    if (!template) return '';

    let result = template;

    // Replace {{variable}} with data values
    Object.entries(data).forEach(([key, value]) => {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
    });

    return result;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ===========================
  // Statistics
  // ===========================

  async getExecutionHistory(tenantId: string, workflowId?: string) {
    const where: any = { tenantId };
    if (workflowId) {
      where.workflowId = workflowId;
    }

    return this.db.workflowExecution.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: {
        workflow: {
          select: {
            name: true,
            trigger: true,
          },
        },
      },
    });
  }

  async getExecutionStats(tenantId: string) {
    const [total, completed, failed, running] = await Promise.all([
      this.db.workflowExecution.count({ where: { tenantId } }),
      this.db.workflowExecution.count({
        where: { tenantId, status: 'COMPLETED' },
      }),
      this.db.workflowExecution.count({
        where: { tenantId, status: 'FAILED' },
      }),
      this.db.workflowExecution.count({
        where: { tenantId, status: 'RUNNING' },
      }),
    ]);

    return {
      total,
      completed,
      failed,
      running,
      successRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }
}
