import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { CustomerPortalService } from './customer-portal.service';

interface PortalRequest extends Request {
  customerId?: string;
  tenantId?: string;
}

@Controller('customer-portal')
export class CustomerPortalController {
  constructor(private portalService: CustomerPortalService) {}

  // ==================== AUTHENTICATION ====================

  @Post('auth/magic-link')
  async sendMagicLink(@Body() body: { tenantId: string; email: string }) {
    await this.portalService.sendMagicLink(body.tenantId, body.email);

    return {
      success: true,
      message: 'Magic link sent to your email',
    };
  }

  @Post('auth/verify')
  async verifyToken(@Body() body: { token: string }) {
    const { customerId, tenantId } = await this.portalService.verifyPortalAccess(body.token);

    return {
      success: true,
      customerId,
      tenantId,
    };
  }

  // Helper to extract auth from headers
  private async extractAuth(headers: any): Promise<{ customerId: string; tenantId: string }> {
    const authHeader = headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No authorization token provided');
    }

    const token = authHeader.substring(7);
    return this.portalService.verifyPortalAccess(token);
  }

  // ==================== PROJECT STATUS ====================

  @Get('projects')
  async getProjects(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getProjectStatus(tenantId, customerId);
  }

  @Get('projects/:jobId')
  async getProject(@Headers() headers: any, @Param('jobId') jobId: string) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    const projects = await this.portalService.getProjectStatus(tenantId, customerId, jobId);

    return projects[0] || null;
  }

  // ==================== DOCUMENTS ====================

  @Get('documents')
  async getDocuments(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getDocuments(tenantId, customerId);
  }

  @Get('documents/:documentId/download')
  async downloadDocument(@Headers() headers: any, @Param('documentId') documentId: string) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    const url = await this.portalService.downloadDocument(tenantId, customerId, documentId);

    return {
      success: true,
      downloadUrl: url,
    };
  }

  // ==================== PAYMENTS ====================

  @Get('invoices')
  async getInvoices(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getInvoices(tenantId, customerId);
  }

  @Post('payments/create-intent')
  async createPaymentIntent(
    @Headers() headers: any,
    @Body() body: { invoiceId: string; amount: number },
  ) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    const paymentIntent = await this.portalService.createPaymentIntent(
      tenantId,
      customerId,
      body.invoiceId,
      body.amount,
    );

    return {
      success: true,
      ...paymentIntent,
    };
  }

  @Post('payments/confirm')
  async confirmPayment(@Headers() headers: any, @Body() body: { paymentIntentId: string }) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    await this.portalService.confirmPayment(tenantId, customerId, body.paymentIntentId);

    return {
      success: true,
      message: 'Payment processed successfully',
    };
  }

  // ==================== MESSAGING ====================

  @Get('messages')
  async getMessages(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getMessages(tenantId, customerId);
  }

  @Post('messages')
  async sendMessage(@Headers() headers: any, @Body() body: { message: string }) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    const message = await this.portalService.sendMessage(tenantId, customerId, body.message);

    return {
      success: true,
      message,
    };
  }

  @Post('messages/mark-read')
  async markMessagesAsRead(@Headers() headers: any, @Body() body: { messageIds: string[] }) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    await this.portalService.markMessagesAsRead(tenantId, customerId, body.messageIds);

    return {
      success: true,
    };
  }

  // ==================== REVIEWS ====================

  @Post('reviews')
  async submitReview(
    @Headers() headers: any,
    @Body()
    body: {
      jobId: string;
      rating: number;
      title?: string;
      comment: string;
      categories?: {
        quality: number;
        communication: number;
        timeliness: number;
        professionalism: number;
        value: number;
      };
    },
  ) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    const review = await this.portalService.submitReview(tenantId, customerId, body.jobId, body);

    return {
      success: true,
      review,
    };
  }

  @Get('reviews')
  async getMyReviews(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getCustomerReviews(tenantId, customerId);
  }

  // ==================== REFERRALS ====================

  @Get('referrals')
  async getReferralProgram(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getReferralProgram(tenantId, customerId);
  }

  @Post('referrals/send')
  async sendReferral(
    @Headers() headers: any,
    @Body() body: { referredName: string; referredEmail: string },
  ) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    await this.portalService.sendReferral(tenantId, customerId, body.referredName, body.referredEmail);

    return {
      success: true,
      message: 'Referral sent successfully',
    };
  }

  // ==================== PHOTO GALLERY ====================

  @Get('photos')
  async getPhotoGallery(@Headers() headers: any, @Query('jobId') jobId?: string) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getPhotoGallery(tenantId, customerId, jobId);
  }

  // ==================== APPOINTMENT BOOKING ====================

  @Get('appointments/available-slots')
  async getAvailableSlots(@Headers() headers: any, @Query('date') dateStr: string) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    const date = new Date(dateStr);
    const slots = await this.portalService.getAvailableSlots(tenantId, date);

    return {
      success: true,
      date: dateStr,
      slots,
    };
  }

  @Post('appointments')
  async bookAppointment(
    @Headers() headers: any,
    @Body()
    body: {
      type: 'CONSULTATION' | 'ESTIMATE' | 'INSPECTION' | 'FOLLOW_UP';
      scheduledAt: string;
      duration?: number;
      location?: string;
      notes?: string;
    },
  ) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    const appointment = await this.portalService.bookAppointment(tenantId, customerId, {
      ...body,
      scheduledAt: new Date(body.scheduledAt),
    });

    return {
      success: true,
      appointment,
    };
  }

  @Get('appointments')
  async getAppointments(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);
    return this.portalService.getAppointments(tenantId, customerId);
  }

  // ==================== DASHBOARD ====================

  @Get('dashboard')
  async getDashboard(@Headers() headers: any) {
    const { customerId, tenantId } = await this.extractAuth(headers);

    // Get all data for dashboard
    const [projects, invoices, messages, appointments] = await Promise.all([
      this.portalService.getProjectStatus(tenantId, customerId),
      this.portalService.getInvoices(tenantId, customerId),
      this.portalService.getMessages(tenantId, customerId),
      this.portalService.getAppointments(tenantId, customerId),
    ]);

    const activeProjects = projects.filter((p) => p.status === 'IN_PROGRESS');
    const pendingInvoices = invoices.filter((i) => i.status === 'PENDING' || i.status === 'OVERDUE');
    const unreadMessages = messages.filter((m) => !m.read && m.from === 'company');
    const upcomingAppointments = appointments.filter((a) => new Date(a.scheduledAt) > new Date());

    return {
      success: true,
      summary: {
        activeProjects: activeProjects.length,
        totalProjects: projects.length,
        pendingInvoices: pendingInvoices.length,
        totalDue: pendingInvoices.reduce((sum, inv) => sum + inv.amountDue, 0),
        unreadMessages: unreadMessages.length,
        upcomingAppointments: upcomingAppointments.length,
      },
      recentActivity: {
        latestProject: projects[0] || null,
        nextAppointment: upcomingAppointments[0] || null,
        recentMessages: messages.slice(0, 5),
      },
    };
  }
}
