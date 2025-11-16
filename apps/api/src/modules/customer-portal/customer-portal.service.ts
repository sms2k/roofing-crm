import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia',
});

export interface CustomerPortalAuth {
  customerId: string;
  email: string;
  token: string;
  expiresAt: Date;
}

export interface ProjectStatus {
  jobId: string;
  jobNumber: string;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD';
  title: string;
  description: string;
  startDate: Date;
  estimatedCompletion?: Date;
  progress: number; // 0-100
  timeline: {
    stage: string;
    status: 'completed' | 'current' | 'pending';
    completedAt?: Date;
    notes?: string;
  }[];
  team: {
    name: string;
    role: string;
    photo?: string;
    phone?: string;
  }[];
  nextSteps: string[];
}

export interface CustomerDocument {
  id: string;
  name: string;
  type: 'CONTRACT' | 'INVOICE' | 'ESTIMATE' | 'PHOTO' | 'WARRANTY' | 'OTHER';
  url: string;
  uploadedAt: Date;
  size: number;
  jobId?: string;
}

export interface PaymentInfo {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  amountDue: number;
  amountPaid: number;
  issuedAt: Date;
  dueAt: Date;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL';
  description: string;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
}

export interface PortalMessage {
  id: string;
  from: 'customer' | 'company';
  senderName: string;
  message: string;
  sentAt: Date;
  read: boolean;
  attachments?: { name: string; url: string }[];
}

export interface CustomerReview {
  id: string;
  jobId: string;
  rating: number; // 1-5
  title?: string;
  comment: string;
  categories: {
    quality: number;
    communication: number;
    timeliness: number;
    professionalism: number;
    value: number;
  };
  publishedAt?: Date;
  response?: {
    message: string;
    respondedAt: Date;
  };
}

export interface ReferralProgram {
  customerId: string;
  referralCode: string;
  referrals: {
    id: string;
    referredName: string;
    referredEmail: string;
    status: 'PENDING' | 'CONVERTED' | 'DECLINED';
    sentAt: Date;
    convertedAt?: Date;
    reward?: {
      type: 'DISCOUNT' | 'CREDIT' | 'CASH';
      amount: number;
      claimed: boolean;
    };
  }[];
  totalReferred: number;
  totalConverted: number;
  totalRewards: number;
}

export interface PhotoGallery {
  jobId: string;
  jobTitle: string;
  photos: {
    id: string;
    url: string;
    thumbnail: string;
    caption?: string;
    uploadedAt: Date;
    category: 'BEFORE' | 'DURING' | 'AFTER' | 'AERIAL' | 'DETAIL';
  }[];
}

export interface AppointmentBooking {
  id: string;
  type: 'CONSULTATION' | 'ESTIMATE' | 'INSPECTION' | 'FOLLOW_UP';
  scheduledAt: Date;
  duration: number; // minutes
  location: string;
  notes?: string;
  assignedTo?: {
    name: string;
    title: string;
    photo?: string;
  };
}

@Injectable()
export class CustomerPortalService {
  constructor(private db: PrismaService) {}

  // ==================== AUTHENTICATION ====================

  async createPortalAccess(tenantId: string, customerId: string, email: string): Promise<CustomerPortalAuth> {
    // Generate magic link or password
    const token = jwt.sign(
      { customerId, email, tenantId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' },
    );

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store access token
    await this.db.$executeRaw`
      INSERT INTO customer_portal_access (customer_id, email, token, expires_at, created_at)
      VALUES (${customerId}, ${email}, ${token}, ${expiresAt}, NOW())
      ON CONFLICT (customer_id) DO UPDATE SET
        token = ${token},
        expires_at = ${expiresAt}
    `;

    return {
      customerId,
      email,
      token,
      expiresAt,
    };
  }

  async verifyPortalAccess(token: string): Promise<{ customerId: string; tenantId: string }> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as any;

      // Check if token exists and not expired
      const access = await this.db.$queryRaw<any[]>`
        SELECT * FROM customer_portal_access
        WHERE customer_id = ${decoded.customerId}
        AND token = ${token}
        AND expires_at > NOW()
      `;

      if (access.length === 0) {
        throw new UnauthorizedException('Invalid or expired token');
      }

      return {
        customerId: decoded.customerId,
        tenantId: decoded.tenantId,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  async sendMagicLink(tenantId: string, email: string): Promise<void> {
    // Find customer by email
    const customer = await this.db.customer.findFirst({
      where: { tenantId, email },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const auth = await this.createPortalAccess(tenantId, customer.id, email);

    // In real implementation, send email with magic link
    const magicLink = `${process.env.PORTAL_URL}/login?token=${auth.token}`;

    // TODO: Send email via email service
    console.log(`Magic link for ${email}: ${magicLink}`);
  }

  // ==================== PROJECT STATUS ====================

  async getProjectStatus(tenantId: string, customerId: string, jobId?: string): Promise<ProjectStatus[]> {
    const jobs = await this.db.job.findMany({
      where: {
        tenantId,
        customerId: jobId ? jobId : undefined,
        status: { in: ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'] },
      },
      include: {
        assignedTo: true,
        property: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return jobs.map((job) => this.formatProjectStatus(job));
  }

  private formatProjectStatus(job: any): ProjectStatus {
    // Calculate progress based on status
    const progressMap = {
      SCHEDULED: 10,
      IN_PROGRESS: 50,
      ON_HOLD: 50,
      COMPLETED: 100,
    };

    // Build timeline based on job status
    const timeline = [
      {
        stage: 'Contract Signed',
        status: 'completed' as const,
        completedAt: job.createdAt,
        notes: 'Project initiated',
      },
      {
        stage: 'Materials Ordered',
        status: job.status === 'SCHEDULED' ? ('pending' as const) : ('completed' as const),
        completedAt: job.status !== 'SCHEDULED' ? job.startedAt : undefined,
      },
      {
        stage: 'Work In Progress',
        status:
          job.status === 'IN_PROGRESS' ? ('current' as const) : job.status === 'COMPLETED' ? ('completed' as const) : ('pending' as const),
        completedAt: job.status === 'COMPLETED' ? job.completedAt : undefined,
      },
      {
        stage: 'Final Inspection',
        status: job.status === 'COMPLETED' ? ('completed' as const) : ('pending' as const),
        completedAt: job.status === 'COMPLETED' ? job.completedAt : undefined,
      },
      {
        stage: 'Project Complete',
        status: job.status === 'COMPLETED' ? ('completed' as const) : ('pending' as const),
        completedAt: job.completedAt,
      },
    ];

    const nextSteps = this.getNextSteps(job.status);

    return {
      jobId: job.id,
      jobNumber: job.jobNumber || job.id.substring(0, 8).toUpperCase(),
      status: job.status,
      title: job.title || 'Roofing Project',
      description: job.description || '',
      startDate: job.startedAt || job.createdAt,
      estimatedCompletion: job.estimatedCompletionDate,
      progress: progressMap[job.status] || 0,
      timeline,
      team: job.assignedTo
        ? [
            {
              name: job.assignedTo.name,
              role: 'Project Manager',
              phone: job.assignedTo.phone,
            },
          ]
        : [],
      nextSteps,
    };
  }

  private getNextSteps(status: string): string[] {
    const stepsMap: Record<string, string[]> = {
      SCHEDULED: ['Materials will be ordered', 'Crew will be scheduled', 'You will receive a start date confirmation'],
      IN_PROGRESS: ['Work is being completed', 'Daily progress updates available', 'Contact your PM with any questions'],
      ON_HOLD: ['Waiting for weather or materials', 'We will notify you when work resumes'],
      COMPLETED: ['Final inspection complete', 'Warranty information has been sent', 'Please leave a review'],
    };

    return stepsMap[status] || [];
  }

  // ==================== DOCUMENTS ====================

  async getDocuments(tenantId: string, customerId: string): Promise<CustomerDocument[]> {
    const documents = await this.db.document.findMany({
      where: { tenantId, customerId },
      orderBy: { uploadedAt: 'desc' },
    });

    return documents.map((doc) => ({
      id: doc.id,
      name: doc.name,
      type: doc.type,
      url: doc.url,
      uploadedAt: doc.uploadedAt,
      size: doc.size,
      jobId: doc.jobId,
    }));
  }

  async downloadDocument(tenantId: string, customerId: string, documentId: string): Promise<string> {
    const document = await this.db.document.findFirst({
      where: { id: documentId, tenantId, customerId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Generate signed URL for download
    // In real implementation, use S3 signed URLs or similar
    return document.url;
  }

  // ==================== PAYMENTS ====================

  async getInvoices(tenantId: string, customerId: string): Promise<PaymentInfo[]> {
    const invoices = await this.db.invoice.findMany({
      where: { tenantId, customerId },
      orderBy: { issuedAt: 'desc' },
    });

    return invoices.map((invoice) => ({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber || invoice.id.substring(0, 8).toUpperCase(),
      amount: invoice.totalAmount,
      amountDue: invoice.amountDue || invoice.totalAmount,
      amountPaid: invoice.totalAmount - (invoice.amountDue || invoice.totalAmount),
      issuedAt: invoice.issuedAt,
      dueAt: invoice.dueAt,
      status: this.getInvoiceStatus(invoice),
      description: invoice.description || 'Roofing Services',
      lineItems: invoice.lineItems || [],
    }));
  }

  private getInvoiceStatus(invoice: any): 'PENDING' | 'PAID' | 'OVERDUE' | 'PARTIAL' {
    if (invoice.status === 'PAID' || invoice.amountDue === 0) return 'PAID';

    const now = new Date();
    if (invoice.dueAt && invoice.dueAt < now) return 'OVERDUE';

    if (invoice.amountDue < invoice.totalAmount) return 'PARTIAL';

    return 'PENDING';
  }

  async createPaymentIntent(
    tenantId: string,
    customerId: string,
    invoiceId: string,
    amount: number,
  ): Promise<{ clientSecret: string; paymentIntentId: string }> {
    // Verify invoice belongs to customer
    const invoice = await this.db.invoice.findFirst({
      where: { id: invoiceId, tenantId, customerId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Create Stripe payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        tenantId,
        customerId,
        invoiceId,
      },
      description: `Payment for Invoice ${invoice.invoiceNumber || invoiceId}`,
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    };
  }

  async confirmPayment(tenantId: string, customerId: string, paymentIntentId: string): Promise<void> {
    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      throw new BadRequestException('Payment not successful');
    }

    const { invoiceId } = paymentIntent.metadata;

    // Record payment in database
    await this.db.payment.create({
      data: {
        tenantId,
        customerId,
        invoiceId,
        amount: paymentIntent.amount / 100,
        method: 'CARD',
        status: 'COMPLETED',
        stripePaymentIntentId: paymentIntentId,
        paidAt: new Date(),
      },
    });

    // Update invoice
    await this.db.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'PAID',
        amountDue: 0,
        paidAt: new Date(),
      },
    });
  }

  // ==================== MESSAGING ====================

  async getMessages(tenantId: string, customerId: string): Promise<PortalMessage[]> {
    const messages = await this.db.portalMessage.findMany({
      where: { tenantId, customerId },
      orderBy: { sentAt: 'asc' },
    });

    return messages;
  }

  async sendMessage(tenantId: string, customerId: string, message: string): Promise<PortalMessage> {
    const newMessage = await this.db.portalMessage.create({
      data: {
        tenantId,
        customerId,
        from: 'customer',
        senderName: 'You',
        message,
        sentAt: new Date(),
        read: false,
      },
    });

    // Notify company (via webhook, email, etc.)
    // TODO: Send notification to company

    return newMessage;
  }

  async markMessagesAsRead(tenantId: string, customerId: string, messageIds: string[]): Promise<void> {
    await this.db.portalMessage.updateMany({
      where: {
        id: { in: messageIds },
        tenantId,
        customerId,
      },
      data: { read: true },
    });
  }

  // ==================== REVIEWS ====================

  async submitReview(
    tenantId: string,
    customerId: string,
    jobId: string,
    reviewData: Partial<CustomerReview>,
  ): Promise<CustomerReview> {
    // Verify job belongs to customer
    const job = await this.db.job.findFirst({
      where: { id: jobId, tenantId, customerId, status: 'COMPLETED' },
    });

    if (!job) {
      throw new BadRequestException('Job not found or not completed');
    }

    const review: CustomerReview = {
      id: `rev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobId,
      rating: reviewData.rating || 5,
      title: reviewData.title,
      comment: reviewData.comment || '',
      categories: reviewData.categories || {
        quality: 5,
        communication: 5,
        timeliness: 5,
        professionalism: 5,
        value: 5,
      },
      publishedAt: new Date(),
    };

    await this.db.review.create({
      data: {
        id: review.id,
        tenantId,
        customerId,
        jobId,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        categories: review.categories,
        publishedAt: review.publishedAt,
      },
    });

    return review;
  }

  async getCustomerReviews(tenantId: string, customerId: string): Promise<CustomerReview[]> {
    const reviews = await this.db.review.findMany({
      where: { tenantId, customerId },
      orderBy: { publishedAt: 'desc' },
    });

    return reviews;
  }

  // ==================== REFERRALS ====================

  async getReferralProgram(tenantId: string, customerId: string): Promise<ReferralProgram> {
    // Get or create referral code
    let referralCode = await this.db.referralCode.findFirst({
      where: { tenantId, customerId },
    });

    if (!referralCode) {
      referralCode = await this.db.referralCode.create({
        data: {
          tenantId,
          customerId,
          code: this.generateReferralCode(),
        },
      });
    }

    // Get referrals
    const referrals = await this.db.referral.findMany({
      where: { tenantId, referrerId: customerId },
      orderBy: { sentAt: 'desc' },
    });

    const totalConverted = referrals.filter((r) => r.status === 'CONVERTED').length;
    const totalRewards = referrals.reduce((sum, r) => sum + (r.reward?.amount || 0), 0);

    return {
      customerId,
      referralCode: referralCode.code,
      referrals: referrals.map((r) => ({
        id: r.id,
        referredName: r.referredName,
        referredEmail: r.referredEmail,
        status: r.status,
        sentAt: r.sentAt,
        convertedAt: r.convertedAt,
        reward: r.reward,
      })),
      totalReferred: referrals.length,
      totalConverted,
      totalRewards,
    };
  }

  async sendReferral(
    tenantId: string,
    customerId: string,
    referredName: string,
    referredEmail: string,
  ): Promise<void> {
    const referralProgram = await this.getReferralProgram(tenantId, customerId);

    const referral = await this.db.referral.create({
      data: {
        tenantId,
        referrerId: customerId,
        referredName,
        referredEmail,
        status: 'PENDING',
        sentAt: new Date(),
      },
    });

    // Send referral email
    // TODO: Send email to referred person with referral code

    console.log(`Referral sent to ${referredEmail} with code ${referralProgram.referralCode}`);
  }

  private generateReferralCode(): string {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }

  // ==================== PHOTO GALLERY ====================

  async getPhotoGallery(tenantId: string, customerId: string, jobId?: string): Promise<PhotoGallery[]> {
    const jobs = await this.db.job.findMany({
      where: {
        tenantId,
        customerId: jobId ? jobId : undefined,
      },
      include: {
        photos: true,
      },
    });

    return jobs
      .filter((job) => job.photos && job.photos.length > 0)
      .map((job) => ({
        jobId: job.id,
        jobTitle: job.title || 'Project',
        photos: job.photos.map((photo: any) => ({
          id: photo.id,
          url: photo.url,
          thumbnail: photo.thumbnail || photo.url,
          caption: photo.caption,
          uploadedAt: photo.uploadedAt,
          category: photo.category || 'DURING',
        })),
      }));
  }

  // ==================== APPOINTMENT BOOKING ====================

  async getAvailableSlots(tenantId: string, date: Date): Promise<Date[]> {
    // Get existing appointments for the day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await this.db.appointment.findMany({
      where: {
        tenantId,
        scheduledAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    // Generate available slots (9 AM to 5 PM, 1-hour intervals)
    const slots: Date[] = [];
    for (let hour = 9; hour <= 16; hour++) {
      const slot = new Date(date);
      slot.setHours(hour, 0, 0, 0);

      // Check if slot is available
      const isBooked = existingAppointments.some((apt) => {
        const aptTime = new Date(apt.scheduledAt);
        return aptTime.getTime() === slot.getTime();
      });

      if (!isBooked) {
        slots.push(slot);
      }
    }

    return slots;
  }

  async bookAppointment(
    tenantId: string,
    customerId: string,
    appointmentData: Partial<AppointmentBooking>,
  ): Promise<AppointmentBooking> {
    const appointment = await this.db.appointment.create({
      data: {
        tenantId,
        customerId,
        type: appointmentData.type || 'CONSULTATION',
        scheduledAt: appointmentData.scheduledAt!,
        duration: appointmentData.duration || 60,
        location: appointmentData.location || 'Customer Property',
        notes: appointmentData.notes,
        status: 'SCHEDULED',
      },
    });

    // Send confirmation email
    // TODO: Send appointment confirmation

    return {
      id: appointment.id,
      type: appointment.type,
      scheduledAt: appointment.scheduledAt,
      duration: appointment.duration,
      location: appointment.location,
      notes: appointment.notes,
    };
  }

  async getAppointments(tenantId: string, customerId: string): Promise<AppointmentBooking[]> {
    const appointments = await this.db.appointment.findMany({
      where: { tenantId, customerId },
      orderBy: { scheduledAt: 'desc' },
    });

    return appointments.map((apt) => ({
      id: apt.id,
      type: apt.type,
      scheduledAt: apt.scheduledAt,
      duration: apt.duration,
      location: apt.location,
      notes: apt.notes,
    }));
  }
}
