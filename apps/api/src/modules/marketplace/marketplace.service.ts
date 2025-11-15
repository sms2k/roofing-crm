import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

interface SubcontractorProfile {
  id: string;
  tenantId: string;
  userId: string;
  companyName: string;
  businessLicense: string;
  insuranceCertificate?: string;
  bondNumber?: string;
  specialties: string[]; // ['ROOFING', 'SIDING', 'GUTTERS', etc.]
  serviceAreas: string[]; // zip codes
  yearsInBusiness: number;
  employeeCount: number;
  certifications: {
    name: string;
    issuedBy: string;
    issuedDate: Date;
    expiryDate?: Date;
    verified: boolean;
  }[];
  status: 'PENDING' | 'VERIFIED' | 'SUSPENDED' | 'REJECTED';
  verifiedAt?: Date;
  rating: number; // 0-5
  totalJobs: number;
  completedJobs: number;
  revenue: number;
  createdAt: Date;
}

interface JobPosting {
  id: string;
  tenantId: string;
  postedById: string;
  title: string;
  description: string;
  category: 'ROOFING' | 'SIDING' | 'GUTTERS' | 'REPAIRS' | 'OTHER';
  budget: {
    min: number;
    max: number;
  };
  location: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  requirements: string[];
  startDate: Date;
  endDate?: Date;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  bids: Bid[];
  selectedBidId?: string;
  postedAt: Date;
  expiresAt: Date;
}

interface Bid {
  id: string;
  jobPostingId: string;
  subcontractorId: string;
  amount: number;
  timeline: number; // days
  proposal: string;
  attachments?: string[];
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  submittedAt: Date;
}

interface Review {
  id: string;
  jobPostingId: string;
  subcontractorId: string;
  reviewerId: string;
  rating: number; // 1-5
  quality: number; // 1-5
  timeliness: number; // 1-5
  communication: number; // 1-5
  professionalism: number; // 1-5
  comment: string;
  response?: string;
  createdAt: Date;
}

interface Payment {
  id: string;
  jobPostingId: string;
  subcontractorId: string;
  amount: number;
  marketplaceFee: number;
  netAmount: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED';
  stripePaymentIntentId?: string;
  paidAt?: Date;
  createdAt: Date;
}

interface MarketplaceAnalytics {
  overview: {
    totalSubcontractors: number;
    verifiedSubcontractors: number;
    activeJobPostings: number;
    totalBids: number;
    completedJobs: number;
    totalRevenue: number;
    marketplaceFees: number;
  };
  topSubcontractors: {
    id: string;
    name: string;
    rating: number;
    completedJobs: number;
    revenue: number;
  }[];
  recentActivity: {
    type: 'JOB_POSTED' | 'BID_PLACED' | 'JOB_AWARDED' | 'JOB_COMPLETED' | 'REVIEW_LEFT';
    description: string;
    timestamp: Date;
  }[];
}

@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);
  private readonly stripeApiKey = process.env.STRIPE_SECRET_KEY || '';
  private readonly marketplaceFeePercent = parseFloat(process.env.MARKETPLACE_FEE_PERCENT || '10');

  constructor(
    private readonly db: DatabaseService,
    private readonly http: HttpService,
  ) {}

  /**
   * Create subcontractor profile
   */
  async createSubcontractorProfile(
    tenantId: string,
    userId: string,
    data: {
      companyName: string;
      businessLicense: string;
      insuranceCertificate?: string;
      bondNumber?: string;
      specialties: string[];
      serviceAreas: string[];
      yearsInBusiness: number;
      employeeCount: number;
    },
  ): Promise<SubcontractorProfile> {
    this.logger.log(`Creating subcontractor profile for user ${userId}`);

    const profile: SubcontractorProfile = {
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      userId,
      companyName: data.companyName,
      businessLicense: data.businessLicense,
      insuranceCertificate: data.insuranceCertificate,
      bondNumber: data.bondNumber,
      specialties: data.specialties,
      serviceAreas: data.serviceAreas,
      yearsInBusiness: data.yearsInBusiness,
      employeeCount: data.employeeCount,
      certifications: [],
      status: 'PENDING',
      rating: 0,
      totalJobs: 0,
      completedJobs: 0,
      revenue: 0,
      createdAt: new Date(),
    };

    await this.storeProfile(tenantId, profile);

    return profile;
  }

  /**
   * Verify subcontractor
   */
  async verifySubcontractor(
    tenantId: string,
    subcontractorId: string,
    verified: boolean,
  ): Promise<SubcontractorProfile> {
    this.logger.log(`Verifying subcontractor ${subcontractorId}: ${verified}`);

    const profile = await this.getProfile(tenantId, subcontractorId);

    profile.status = verified ? 'VERIFIED' : 'REJECTED';
    profile.verifiedAt = verified ? new Date() : undefined;

    await this.updateProfile(tenantId, profile);

    return profile;
  }

  /**
   * Add certification
   */
  async addCertification(
    tenantId: string,
    subcontractorId: string,
    cert: {
      name: string;
      issuedBy: string;
      issuedDate: Date;
      expiryDate?: Date;
    },
  ): Promise<SubcontractorProfile> {
    const profile = await this.getProfile(tenantId, subcontractorId);

    profile.certifications.push({
      ...cert,
      verified: false,
    });

    await this.updateProfile(tenantId, profile);

    return profile;
  }

  /**
   * Create job posting
   */
  async createJobPosting(
    tenantId: string,
    userId: string,
    data: {
      title: string;
      description: string;
      category: JobPosting['category'];
      budget: { min: number; max: number };
      location: JobPosting['location'];
      requirements: string[];
      startDate: Date;
      endDate?: Date;
      durationDays?: number;
    },
  ): Promise<JobPosting> {
    this.logger.log(`Creating job posting: ${data.title}`);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (data.durationDays || 30));

    const posting: JobPosting = {
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tenantId,
      postedById: userId,
      title: data.title,
      description: data.description,
      category: data.category,
      budget: data.budget,
      location: data.location,
      requirements: data.requirements,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'OPEN',
      bids: [],
      postedAt: new Date(),
      expiresAt,
    };

    await this.storeJobPosting(tenantId, posting);

    return posting;
  }

  /**
   * Submit bid
   */
  async submitBid(
    tenantId: string,
    subcontractorId: string,
    jobPostingId: string,
    bidData: {
      amount: number;
      timeline: number;
      proposal: string;
      attachments?: string[];
    },
  ): Promise<Bid> {
    this.logger.log(`Submitting bid for job ${jobPostingId}`);

    // Verify subcontractor is verified
    const profile = await this.getProfile(tenantId, subcontractorId);
    if (profile.status !== 'VERIFIED') {
      throw new BadRequestException('Subcontractor must be verified to submit bids');
    }

    // Get job posting
    const posting = await this.getJobPosting(tenantId, jobPostingId);
    if (posting.status !== 'OPEN') {
      throw new BadRequestException('Job posting is not open for bids');
    }

    // Check if already bid
    const existingBid = posting.bids.find((b) => b.subcontractorId === subcontractorId);
    if (existingBid) {
      throw new BadRequestException('Already submitted bid for this job');
    }

    const bid: Bid = {
      id: `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobPostingId,
      subcontractorId,
      amount: bidData.amount,
      timeline: bidData.timeline,
      proposal: bidData.proposal,
      attachments: bidData.attachments,
      status: 'PENDING',
      submittedAt: new Date(),
    };

    posting.bids.push(bid);
    await this.updateJobPosting(tenantId, posting);

    return bid;
  }

  /**
   * Accept bid
   */
  async acceptBid(
    tenantId: string,
    jobPostingId: string,
    bidId: string,
  ): Promise<JobPosting> {
    this.logger.log(`Accepting bid ${bidId} for job ${jobPostingId}`);

    const posting = await this.getJobPosting(tenantId, jobPostingId);

    const bid = posting.bids.find((b) => b.id === bidId);
    if (!bid) {
      throw new NotFoundException('Bid not found');
    }

    // Update bid statuses
    posting.bids.forEach((b) => {
      if (b.id === bidId) {
        b.status = 'ACCEPTED';
      } else if (b.status === 'PENDING') {
        b.status = 'REJECTED';
      }
    });

    posting.selectedBidId = bidId;
    posting.status = 'IN_PROGRESS';

    await this.updateJobPosting(tenantId, posting);

    // Notify subcontractor (would integrate with notification system)
    this.logger.log(`Bid accepted for subcontractor ${bid.subcontractorId}`);

    return posting;
  }

  /**
   * Complete job
   */
  async completeJob(
    tenantId: string,
    jobPostingId: string,
  ): Promise<JobPosting> {
    this.logger.log(`Completing job ${jobPostingId}`);

    const posting = await this.getJobPosting(tenantId, jobPostingId);

    if (posting.status !== 'IN_PROGRESS') {
      throw new BadRequestException('Job is not in progress');
    }

    posting.status = 'COMPLETED';

    await this.updateJobPosting(tenantId, posting);

    // Update subcontractor stats
    if (posting.selectedBidId) {
      const selectedBid = posting.bids.find((b) => b.id === posting.selectedBidId);
      if (selectedBid) {
        await this.updateSubcontractorStats(
          tenantId,
          selectedBid.subcontractorId,
          selectedBid.amount,
        );
      }
    }

    return posting;
  }

  /**
   * Update subcontractor stats
   */
  private async updateSubcontractorStats(
    tenantId: string,
    subcontractorId: string,
    revenue: number,
  ): Promise<void> {
    const profile = await this.getProfile(tenantId, subcontractorId);

    profile.totalJobs++;
    profile.completedJobs++;
    profile.revenue += revenue;

    await this.updateProfile(tenantId, profile);
  }

  /**
   * Submit review
   */
  async submitReview(
    tenantId: string,
    jobPostingId: string,
    reviewerId: string,
    reviewData: {
      rating: number;
      quality: number;
      timeliness: number;
      communication: number;
      professionalism: number;
      comment: string;
    },
  ): Promise<Review> {
    this.logger.log(`Submitting review for job ${jobPostingId}`);

    const posting = await this.getJobPosting(tenantId, jobPostingId);

    if (posting.status !== 'COMPLETED') {
      throw new BadRequestException('Can only review completed jobs');
    }

    if (!posting.selectedBidId) {
      throw new BadRequestException('No bid was selected for this job');
    }

    const selectedBid = posting.bids.find((b) => b.id === posting.selectedBidId);
    if (!selectedBid) {
      throw new NotFoundException('Selected bid not found');
    }

    const review: Review = {
      id: `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      jobPostingId,
      subcontractorId: selectedBid.subcontractorId,
      reviewerId,
      rating: reviewData.rating,
      quality: reviewData.quality,
      timeliness: reviewData.timeliness,
      communication: reviewData.communication,
      professionalism: reviewData.professionalism,
      comment: reviewData.comment,
      createdAt: new Date(),
    };

    await this.storeReview(tenantId, review);

    // Update subcontractor rating
    await this.updateSubcontractorRating(tenantId, selectedBid.subcontractorId);

    return review;
  }

  /**
   * Update subcontractor rating
   */
  private async updateSubcontractorRating(
    tenantId: string,
    subcontractorId: string,
  ): Promise<void> {
    const reviews = await this.getSubcontractorReviews(tenantId, subcontractorId);

    if (reviews.length === 0) return;

    const averageRating =
      reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

    const profile = await this.getProfile(tenantId, subcontractorId);
    profile.rating = Math.round(averageRating * 10) / 10;

    await this.updateProfile(tenantId, profile);
  }

  /**
   * Process payment
   */
  async processPayment(
    tenantId: string,
    jobPostingId: string,
    paymentMethodId: string,
  ): Promise<Payment> {
    this.logger.log(`Processing payment for job ${jobPostingId}`);

    const posting = await this.getJobPosting(tenantId, jobPostingId);

    if (!posting.selectedBidId) {
      throw new BadRequestException('No bid selected');
    }

    const selectedBid = posting.bids.find((b) => b.id === posting.selectedBidId);
    if (!selectedBid) {
      throw new NotFoundException('Selected bid not found');
    }

    const amount = selectedBid.amount;
    const marketplaceFee = amount * (this.marketplaceFeePercent / 100);
    const netAmount = amount - marketplaceFee;

    if (!this.stripeApiKey) {
      this.logger.warn('Stripe not configured, creating mock payment');

      const mockPayment: Payment = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        jobPostingId,
        subcontractorId: selectedBid.subcontractorId,
        amount,
        marketplaceFee,
        netAmount,
        status: 'COMPLETED',
        stripePaymentIntentId: 'mock_pi_' + Date.now(),
        paidAt: new Date(),
        createdAt: new Date(),
      };

      await this.storePayment(tenantId, mockPayment);
      return mockPayment;
    }

    try {
      // Create Stripe payment intent
      const response = await firstValueFrom(
        this.http.post(
          'https://api.stripe.com/v1/payment_intents',
          new URLSearchParams({
            amount: Math.round(amount * 100).toString(), // Convert to cents
            currency: 'usd',
            payment_method: paymentMethodId,
            confirm: 'true',
            description: `Job: ${posting.title}`,
          }),
          {
            headers: {
              Authorization: `Bearer ${this.stripeApiKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
          },
        ),
      );

      const payment: Payment = {
        id: `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        jobPostingId,
        subcontractorId: selectedBid.subcontractorId,
        amount,
        marketplaceFee,
        netAmount,
        status: response.data.status === 'succeeded' ? 'COMPLETED' : 'PROCESSING',
        stripePaymentIntentId: response.data.id,
        paidAt: response.data.status === 'succeeded' ? new Date() : undefined,
        createdAt: new Date(),
      };

      await this.storePayment(tenantId, payment);

      return payment;
    } catch (error) {
      this.logger.error(`Payment failed: ${error.message}`);
      throw new BadRequestException('Payment processing failed');
    }
  }

  /**
   * Get marketplace analytics
   */
  async getMarketplaceAnalytics(tenantId: string): Promise<MarketplaceAnalytics> {
    this.logger.log('Getting marketplace analytics');

    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const profiles = (tenant?.settings as any)?.subcontractorProfiles || [];
    const postings = (tenant?.settings as any)?.jobPostings || [];
    const payments = (tenant?.settings as any)?.payments || [];

    const totalSubcontractors = profiles.length;
    const verifiedSubcontractors = profiles.filter(
      (p: SubcontractorProfile) => p.status === 'VERIFIED',
    ).length;

    const activeJobPostings = postings.filter(
      (p: JobPosting) => p.status === 'OPEN' || p.status === 'IN_PROGRESS',
    ).length;

    const totalBids = postings.reduce(
      (sum: number, p: JobPosting) => sum + p.bids.length,
      0,
    );

    const completedJobs = postings.filter((p: JobPosting) => p.status === 'COMPLETED').length;

    const totalRevenue = payments.reduce(
      (sum: number, p: Payment) => sum + (p.status === 'COMPLETED' ? p.amount : 0),
      0,
    );

    const marketplaceFees = payments.reduce(
      (sum: number, p: Payment) =>
        sum + (p.status === 'COMPLETED' ? p.marketplaceFee : 0),
      0,
    );

    // Get top subcontractors
    const topSubcontractors = profiles
      .filter((p: SubcontractorProfile) => p.status === 'VERIFIED')
      .sort((a: SubcontractorProfile, b: SubcontractorProfile) => b.rating - a.rating)
      .slice(0, 10)
      .map((p: SubcontractorProfile) => ({
        id: p.id,
        name: p.companyName,
        rating: p.rating,
        completedJobs: p.completedJobs,
        revenue: p.revenue,
      }));

    // Recent activity (simplified)
    const recentActivity = [];

    return {
      overview: {
        totalSubcontractors,
        verifiedSubcontractors,
        activeJobPostings,
        totalBids,
        completedJobs,
        totalRevenue,
        marketplaceFees,
      },
      topSubcontractors,
      recentActivity,
    };
  }

  /**
   * Search subcontractors
   */
  async searchSubcontractors(
    tenantId: string,
    filters: {
      specialties?: string[];
      serviceAreas?: string[];
      minRating?: number;
      verified?: boolean;
    },
  ): Promise<SubcontractorProfile[]> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    let profiles = (tenant?.settings as any)?.subcontractorProfiles || [];

    if (filters.specialties) {
      profiles = profiles.filter((p: SubcontractorProfile) =>
        filters.specialties!.some((s) => p.specialties.includes(s)),
      );
    }

    if (filters.serviceAreas) {
      profiles = profiles.filter((p: SubcontractorProfile) =>
        filters.serviceAreas!.some((a) => p.serviceAreas.includes(a)),
      );
    }

    if (filters.minRating) {
      profiles = profiles.filter((p: SubcontractorProfile) => p.rating >= filters.minRating!);
    }

    if (filters.verified !== undefined) {
      profiles = profiles.filter(
        (p: SubcontractorProfile) => (p.status === 'VERIFIED') === filters.verified,
      );
    }

    return profiles.sort((a: SubcontractorProfile, b: SubcontractorProfile) => b.rating - a.rating);
  }

  // Storage helpers
  private async storeProfile(tenantId: string, profile: SubcontractorProfile): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const profiles = (tenant?.settings as any)?.subcontractorProfiles || [];
    profiles.push(profile);
    await this.db.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...(tenant?.settings as any), subcontractorProfiles: profiles } },
    });
  }

  private async updateProfile(tenantId: string, profile: SubcontractorProfile): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const profiles = (tenant?.settings as any)?.subcontractorProfiles || [];
    const index = profiles.findIndex((p: SubcontractorProfile) => p.id === profile.id);
    if (index !== -1) {
      profiles[index] = profile;
      await this.db.tenant.update({
        where: { id: tenantId },
        data: { settings: { ...(tenant?.settings as any), subcontractorProfiles: profiles } },
      });
    }
  }

  async getProfile(tenantId: string, profileId: string): Promise<SubcontractorProfile> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const profiles = (tenant?.settings as any)?.subcontractorProfiles || [];
    const profile = profiles.find((p: SubcontractorProfile) => p.id === profileId);
    if (!profile) throw new NotFoundException('Subcontractor profile not found');
    return profile;
  }

  private async storeJobPosting(tenantId: string, posting: JobPosting): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const postings = (tenant?.settings as any)?.jobPostings || [];
    postings.push(posting);
    await this.db.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...(tenant?.settings as any), jobPostings: postings } },
    });
  }

  private async updateJobPosting(tenantId: string, posting: JobPosting): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const postings = (tenant?.settings as any)?.jobPostings || [];
    const index = postings.findIndex((p: JobPosting) => p.id === posting.id);
    if (index !== -1) {
      postings[index] = posting;
      await this.db.tenant.update({
        where: { id: tenantId },
        data: { settings: { ...(tenant?.settings as any), jobPostings: postings } },
      });
    }
  }

  async getJobPosting(tenantId: string, postingId: string): Promise<JobPosting> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const postings = (tenant?.settings as any)?.jobPostings || [];
    const posting = postings.find((p: JobPosting) => p.id === postingId);
    if (!posting) throw new NotFoundException('Job posting not found');
    return posting;
  }

  private async storeReview(tenantId: string, review: Review): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const reviews = (tenant?.settings as any)?.subcontractorReviews || [];
    reviews.push(review);
    await this.db.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...(tenant?.settings as any), subcontractorReviews: reviews } },
    });
  }

  async getSubcontractorReviews(tenantId: string, subcontractorId: string): Promise<Review[]> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const reviews = (tenant?.settings as any)?.subcontractorReviews || [];
    return reviews.filter((r: Review) => r.subcontractorId === subcontractorId);
  }

  private async storePayment(tenantId: string, payment: Payment): Promise<void> {
    const tenant = await this.db.tenant.findUnique({ where: { id: tenantId } });
    const payments = (tenant?.settings as any)?.payments || [];
    payments.push(payment);
    await this.db.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...(tenant?.settings as any), payments } },
    });
  }
}
