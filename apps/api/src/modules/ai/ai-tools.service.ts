import { Injectable, Logger } from '@nestjs/common';
import { LeadsService } from '../leads/leads.service';
import { JobsService } from '../jobs/jobs.service';
import { TasksService } from '../tasks/tasks.service';
import { ContactsService } from '../contacts/contacts.service';
import { LeadSource, LeadStatus, TaskPriority } from '@roofing-crm/database';

export interface AITool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

@Injectable()
export class AIToolsService {
  private readonly logger = new Logger(AIToolsService.name);

  constructor(
    private readonly leadsService: LeadsService,
    private readonly jobsService: JobsService,
    private readonly tasksService: TasksService,
    private readonly contactsService: ContactsService
  ) {}

  /**
   * Get all available AI tools
   */
  getTools(): AITool[] {
    return [
      // Lead Management Tools
      {
        name: 'create_lead',
        description:
          'Create a new lead in the CRM. Use this when a potential customer expresses interest in roofing services.',
        parameters: {
          type: 'object',
          properties: {
            firstName: { type: 'string', description: 'Customer first name' },
            lastName: { type: 'string', description: 'Customer last name' },
            phone: { type: 'string', description: 'Phone number' },
            email: { type: 'string', description: 'Email address (optional)' },
            address: {
              type: 'object',
              description: 'Property address',
              properties: {
                street: { type: 'string' },
                city: { type: 'string' },
                state: { type: 'string' },
                zip: { type: 'string' },
              },
            },
            source: {
              type: 'string',
              enum: ['STORM', 'REFERRAL', 'MARKETING', 'CANVASSING', 'WEBSITE', 'PHONE', 'OTHER'],
              description: 'How the lead found us',
            },
            urgency: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
              description: 'How urgent is this lead',
            },
            notes: { type: 'string', description: 'Any additional notes from the conversation' },
          },
          required: ['firstName', 'lastName', 'phone', 'source'],
        },
      },

      {
        name: 'update_lead',
        description: 'Update an existing lead information or status.',
        parameters: {
          type: 'object',
          properties: {
            leadId: { type: 'string', description: 'The ID of the lead to update' },
            status: {
              type: 'string',
              enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'LOST'],
              description: 'New lead status',
            },
            urgency: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
            },
            notes: { type: 'string', description: 'Additional notes' },
          },
          required: ['leadId'],
        },
      },

      {
        name: 'search_leads',
        description:
          'Search for leads by various criteria. Use this to find existing leads before creating duplicates.',
        parameters: {
          type: 'object',
          properties: {
            phone: { type: 'string', description: 'Search by phone number' },
            email: { type: 'string', description: 'Search by email' },
            name: { type: 'string', description: 'Search by name (first or last)' },
            address: { type: 'string', description: 'Search by address' },
            status: { type: 'string', description: 'Filter by lead status' },
          },
          required: [],
        },
      },

      // Appointment & Scheduling Tools
      {
        name: 'book_appointment',
        description:
          'Schedule an appointment for a customer. Check availability first before booking.',
        parameters: {
          type: 'object',
          properties: {
            leadId: { type: 'string', description: 'Lead ID for this appointment' },
            jobId: { type: 'string', description: 'Job ID if already converted (optional)' },
            appointmentType: {
              type: 'string',
              enum: ['INSPECTION', 'ESTIMATE', 'CONSULTATION', 'FOLLOW_UP', 'INSTALLATION'],
              description: 'Type of appointment',
            },
            dateTime: {
              type: 'string',
              description: 'Date and time in ISO format (e.g., 2024-01-15T10:00:00Z)',
            },
            duration: { type: 'number', description: 'Duration in minutes (default: 60)' },
            assignedTo: { type: 'string', description: 'User ID of rep or crew member' },
            notes: { type: 'string', description: 'Appointment notes' },
          },
          required: ['dateTime', 'appointmentType'],
        },
      },

      {
        name: 'check_availability',
        description: 'Check available time slots for appointments.',
        parameters: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date to check (YYYY-MM-DD)' },
            userId: { type: 'string', description: 'Specific user to check (optional)' },
            duration: { type: 'number', description: 'Required duration in minutes' },
          },
          required: ['date'],
        },
      },

      {
        name: 'reschedule_appointment',
        description: 'Reschedule an existing appointment to a new date/time.',
        parameters: {
          type: 'object',
          properties: {
            appointmentId: { type: 'string', description: 'The appointment ID to reschedule' },
            newDateTime: { type: 'string', description: 'New date and time in ISO format' },
            reason: { type: 'string', description: 'Reason for rescheduling' },
          },
          required: ['appointmentId', 'newDateTime'],
        },
      },

      // Job Operations Tools
      {
        name: 'create_job',
        description:
          'Convert a qualified lead into a job/opportunity. Use this when a lead is ready to proceed.',
        parameters: {
          type: 'object',
          properties: {
            leadId: { type: 'string', description: 'Lead ID to convert' },
            jobType: {
              type: 'string',
              enum: [
                'RESIDENTIAL_REROOF',
                'RESIDENTIAL_REPAIR',
                'COMMERCIAL_REROOF',
                'COMMERCIAL_REPAIR',
                'INSURANCE_CLAIM',
                'MAINTENANCE',
              ],
              description: 'Type of roofing job',
            },
            estimatedValue: { type: 'number', description: 'Estimated job value in dollars' },
            notes: { type: 'string', description: 'Job notes' },
          },
          required: ['leadId', 'jobType'],
        },
      },

      {
        name: 'update_job_status',
        description: 'Update the status of a job in the pipeline.',
        parameters: {
          type: 'object',
          properties: {
            jobId: { type: 'string', description: 'Job ID to update' },
            status: {
              type: 'string',
              enum: [
                'QUALIFIED',
                'INSPECTED',
                'ESTIMATED',
                'PROPOSED',
                'NEGOTIATING',
                'SOLD',
                'SCHEDULED',
                'IN_PRODUCTION',
                'COMPLETED',
              ],
              description: 'New job status',
            },
            notes: { type: 'string', description: 'Notes about the status change' },
          },
          required: ['jobId', 'status'],
        },
      },

      {
        name: 'get_job_details',
        description: 'Retrieve complete details about a specific job.',
        parameters: {
          type: 'object',
          properties: {
            jobId: { type: 'string', description: 'Job ID to retrieve' },
          },
          required: ['jobId'],
        },
      },

      // Task Management Tools
      {
        name: 'create_task',
        description:
          'Create a task for team members. Use this to ensure follow-ups and actions are tracked.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Task title' },
            description: { type: 'string', description: 'Detailed task description' },
            assignedTo: { type: 'string', description: 'User ID to assign task to' },
            priority: {
              type: 'string',
              enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'],
              description: 'Task priority',
            },
            dueDate: { type: 'string', description: 'Due date in ISO format' },
            relatedToType: {
              type: 'string',
              enum: ['LEAD', 'JOB', 'CONTACT'],
              description: 'What this task relates to',
            },
            relatedToId: { type: 'string', description: 'ID of related entity' },
          },
          required: ['title', 'assignedTo'],
        },
      },

      // Communication Tools
      {
        name: 'draft_email',
        description: 'Generate a draft email for a specific purpose. Returns the email content.',
        parameters: {
          type: 'object',
          properties: {
            purpose: {
              type: 'string',
              enum: [
                'FOLLOW_UP',
                'APPOINTMENT_REMINDER',
                'ESTIMATE_SEND',
                'THANK_YOU',
                'PROPOSAL',
                'PAYMENT_REMINDER',
              ],
              description: 'Purpose of the email',
            },
            recipientName: { type: 'string', description: 'Recipient name' },
            context: {
              type: 'object',
              description: 'Additional context for email generation',
            },
          },
          required: ['purpose', 'recipientName'],
        },
      },

      {
        name: 'draft_sms',
        description: 'Generate a draft SMS message. Returns the message text.',
        parameters: {
          type: 'object',
          properties: {
            purpose: {
              type: 'string',
              enum: [
                'APPOINTMENT_REMINDER',
                'ON_THE_WAY',
                'FOLLOW_UP',
                'ESTIMATE_READY',
                'PAYMENT_REMINDER',
              ],
              description: 'Purpose of the SMS',
            },
            recipientName: { type: 'string', description: 'Recipient name' },
            context: {
              type: 'object',
              description: 'Additional context',
            },
          },
          required: ['purpose'],
        },
      },

      // Information Retrieval Tools
      {
        name: 'get_company_info',
        description: 'Get information about the roofing company (hours, services, policies, etc.)',
        parameters: {
          type: 'object',
          properties: {
            infoType: {
              type: 'string',
              enum: ['HOURS', 'SERVICES', 'WARRANTY', 'PAYMENT_TERMS', 'EMERGENCY', 'GENERAL'],
              description: 'Type of information requested',
            },
          },
          required: ['infoType'],
        },
      },

      {
        name: 'calculate_estimate',
        description:
          'Generate a rough estimate based on property details. For detailed estimates, create a job.',
        parameters: {
          type: 'object',
          properties: {
            roofSquares: { type: 'number', description: 'Number of roofing squares (1 square = 100 sq ft)' },
            roofType: {
              type: 'string',
              enum: ['ASPHALT_SHINGLE', 'METAL', 'TILE', 'FLAT'],
              description: 'Type of roof',
            },
            stories: { type: 'number', description: 'Number of stories' },
            pitch: { type: 'string', description: 'Roof pitch (e.g., "6/12")' },
            layers: { type: 'number', description: 'Number of existing layers to remove' },
          },
          required: ['roofSquares', 'roofType'],
        },
      },
    ];
  }

  /**
   * Execute a tool call
   */
  async executeTool(
    toolName: string,
    args: Record<string, any>,
    tenantId: string,
    userId?: string
  ): Promise<any> {
    this.logger.debug(`Executing tool: ${toolName} with args:`, args);

    try {
      switch (toolName) {
        // Lead tools
        case 'create_lead':
          return await this.createLead(args, tenantId);

        case 'update_lead':
          return await this.updateLead(args, tenantId);

        case 'search_leads':
          return await this.searchLeads(args, tenantId);

        // Job tools
        case 'create_job':
          return await this.createJob(args, tenantId);

        case 'update_job_status':
          return await this.updateJobStatus(args, tenantId);

        case 'get_job_details':
          return await this.getJobDetails(args, tenantId);

        // Task tools
        case 'create_task':
          return await this.createTask(args, tenantId);

        // Communication tools
        case 'draft_email':
          return this.draftEmail(args);

        case 'draft_sms':
          return this.draftSms(args);

        // Information tools
        case 'get_company_info':
          return this.getCompanyInfo(args, tenantId);

        case 'calculate_estimate':
          return this.calculateEstimate(args);

        // Appointment tools (placeholder - needs calendar module)
        case 'book_appointment':
        case 'check_availability':
        case 'reschedule_appointment':
          return {
            success: false,
            message: 'Appointment features coming soon. Calendar integration in progress.',
          };

        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      this.logger.error(`Error executing tool ${toolName}:`, error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Tool implementation methods

  private async createLead(args: any, tenantId: string) {
    const lead = await this.leadsService.create(tenantId, {
      source: args.source,
      urgency: args.urgency || 'MEDIUM',
      tags: [],
      customFields: { notes: args.notes },
    });

    // Create contact if provided
    if (args.firstName && args.lastName) {
      const contact = await this.contactsService.create(tenantId, {
        firstName: args.firstName,
        lastName: args.lastName,
        phone: args.phone,
        email: args.email,
        address: args.address,
        preferredContact: 'PHONE',
        tags: [],
      });

      // Link contact to lead (would need to update lead with contactId)
      return {
        success: true,
        lead,
        contact,
        message: `Lead created successfully for ${args.firstName} ${args.lastName}`,
      };
    }

    return { success: true, lead };
  }

  private async updateLead(args: any, tenantId: string) {
    const updated = await this.leadsService.update(args.leadId, tenantId, {
      status: args.status,
      urgency: args.urgency,
    });

    return {
      success: true,
      lead: updated,
      message: 'Lead updated successfully',
    };
  }

  private async searchLeads(args: any, tenantId: string) {
    // This is a simplified search - would need more sophisticated search in production
    const allLeads = await this.leadsService.findAll(tenantId);

    return {
      success: true,
      leads: allLeads.slice(0, 10), // Return first 10 for now
      count: allLeads.length,
    };
  }

  private async createJob(args: any, tenantId: string) {
    const lead = await this.leadsService.findOne(args.leadId, tenantId);

    if (!lead || !lead.contactId || !lead.propertyId) {
      return {
        success: false,
        message: 'Lead must have contact and property information to convert to job',
      };
    }

    const job = await this.jobsService.create(tenantId, {
      type: args.jobType,
      contactId: lead.contactId,
      propertyId: lead.propertyId,
      leadId: args.leadId,
      value: args.estimatedValue,
      tags: [],
    });

    // Update lead status to CONVERTED
    await this.leadsService.update(args.leadId, tenantId, {
      status: LeadStatus.CONVERTED,
    });

    return {
      success: true,
      job,
      message: 'Job created successfully from lead',
    };
  }

  private async updateJobStatus(args: any, tenantId: string) {
    const updated = await this.jobsService.update(args.jobId, {
      status: args.status,
    });

    return {
      success: true,
      job: updated,
      message: `Job status updated to ${args.status}`,
    };
  }

  private async getJobDetails(args: any, tenantId: string) {
    const job = await this.jobsService.findOne(args.jobId, tenantId);

    return {
      success: true,
      job,
    };
  }

  private async createTask(args: any, tenantId: string) {
    const task = await this.tasksService.create(tenantId, {
      title: args.title,
      description: args.description,
      assignedToId: args.assignedTo,
      priority: args.priority || TaskPriority.MEDIUM,
      dueDate: args.dueDate ? new Date(args.dueDate) : undefined,
      relatedToType: args.relatedToType,
      relatedToId: args.relatedToId,
    });

    return {
      success: true,
      task,
      message: 'Task created successfully',
    };
  }

  private draftEmail(args: any) {
    const templates = {
      FOLLOW_UP: `Subject: Following up on your roofing project

Hi ${args.recipientName},

I wanted to follow up on our recent conversation about your roofing project. Have you had a chance to review the information we discussed?

I'm here to answer any questions you might have and help move forward with your project.

Best regards,`,

      APPOINTMENT_REMINDER: `Subject: Reminder: Upcoming appointment

Hi ${args.recipientName},

This is a friendly reminder about your upcoming appointment with us.

We look forward to seeing you!

Best regards,`,

      ESTIMATE_SEND: `Subject: Your roofing estimate is ready

Hi ${args.recipientName},

Thank you for your interest in our roofing services! Your personalized estimate is ready for your review.

Please review the estimate at your convenience and let me know if you have any questions.

Best regards,`,
    };

    return {
      success: true,
      subject: templates[args.purpose]?.split('\n')[0].replace('Subject: ', ''),
      body: templates[args.purpose],
    };
  }

  private draftSms(args: any) {
    const templates = {
      APPOINTMENT_REMINDER: `Hi ${args.recipientName || 'there'}! Reminder: You have an appointment with us tomorrow. Reply YES to confirm or call us to reschedule.`,
      ON_THE_WAY: `Hi! We're on our way to your property. Should arrive in about 15 minutes. See you soon!`,
      FOLLOW_UP: `Hi ${args.recipientName}! Just following up on your roofing project. Any questions? Reply or call us anytime!`,
      ESTIMATE_READY: `Great news! Your roofing estimate is ready. Check your email or reply for details.`,
      PAYMENT_REMINDER: `Hi! Friendly reminder that your payment is due soon. Reply or call if you have any questions.`,
    };

    return {
      success: true,
      message: templates[args.purpose] || 'Message template not found',
    };
  }

  private async getCompanyInfo(args: any, tenantId: string) {
    // This would fetch from tenant settings in production
    const info = {
      HOURS: 'Monday-Friday: 8AM-5PM, Saturday: 9AM-1PM, Sunday: Closed',
      SERVICES:
        'Full roof replacements, repairs, inspections, emergency services, insurance claims, commercial & residential',
      WARRANTY: '10-year workmanship warranty, material warranties vary by manufacturer',
      PAYMENT_TERMS: 'Deposit due at contract signing, progress payments, final payment upon completion',
      EMERGENCY: '24/7 emergency services available. Call our emergency line for immediate assistance.',
      GENERAL: 'Licensed, insured, and bonded roofing contractor serving the area for over 20 years',
    };

    return {
      success: true,
      information: info[args.infoType] || info.GENERAL,
    };
  }

  private calculateEstimate(args: any) {
    // Simplified estimate calculation
    const baseRates = {
      ASPHALT_SHINGLE: 450,
      METAL: 850,
      TILE: 950,
      FLAT: 650,
    };

    const baseRate = baseRates[args.roofType] || 500;
    const squares = args.roofSquares;
    const layers = args.layers || 1;

    // Basic calculation
    let total = baseRate * squares;

    // Add tearoff cost
    total += layers * 100 * squares;

    // Pitch multiplier
    if (args.pitch) {
      const [rise, run] = args.pitch.split('/').map(Number);
      if (rise > 6) {
        total *= 1.2; // 20% increase for steep roofs
      }
    }

    // Stories multiplier
    if (args.stories > 1) {
      total *= 1.1; // 10% increase per story
    }

    return {
      success: true,
      estimate: {
        lowEnd: Math.round(total * 0.9),
        highEnd: Math.round(total * 1.1),
        average: Math.round(total),
        squares: squares,
        roofType: args.roofType,
        disclaimer:
          'This is a rough estimate. Actual costs may vary based on specific conditions, materials, and additional work required.',
      },
    };
  }
}
