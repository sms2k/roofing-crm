import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  Request,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';

class CreateSubcontractorDto {
  companyName: string;
  businessLicense: string;
  insuranceCertificate?: string;
  bondNumber?: string;
  specialties: string[];
  serviceAreas: string[];
  yearsInBusiness: number;
  employeeCount: number;
}

class AddCertificationDto {
  name: string;
  issuedBy: string;
  issuedDate: string;
  expiryDate?: string;
}

class CreateJobPostingDto {
  title: string;
  description: string;
  category: 'ROOFING' | 'SIDING' | 'GUTTERS' | 'REPAIRS' | 'OTHER';
  budget: { min: number; max: number };
  location: {
    address: string;
    city: string;
    state: string;
    zipCode: string;
  };
  requirements: string[];
  startDate: string;
  endDate?: string;
  durationDays?: number;
}

class SubmitBidDto {
  amount: number;
  timeline: number;
  proposal: string;
  attachments?: string[];
}

class SubmitReviewDto {
  rating: number;
  quality: number;
  timeliness: number;
  communication: number;
  professionalism: number;
  comment: string;
}

class ProcessPaymentDto {
  paymentMethodId: string;
}

class SearchSubcontractorsDto {
  specialties?: string;
  serviceAreas?: string;
  minRating?: number;
  verified?: boolean;
}

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  /**
   * Create subcontractor profile
   * POST /marketplace/subcontractors
   */
  @Post('subcontractors')
  async createSubcontractor(@Body() body: CreateSubcontractorDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    return this.marketplace.createSubcontractorProfile(tenantId, userId, body);
  }

  /**
   * Get subcontractor profile
   * GET /marketplace/subcontractors/:id
   */
  @Get('subcontractors/:id')
  async getSubcontractor(@Param('id') id: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.marketplace.getProfile(tenantId, id);
  }

  /**
   * Verify subcontractor
   * PUT /marketplace/subcontractors/:id/verify
   */
  @Put('subcontractors/:id/verify')
  async verifySubcontractor(
    @Param('id') id: string,
    @Body() body: { verified: boolean },
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    return this.marketplace.verifySubcontractor(tenantId, id, body.verified);
  }

  /**
   * Add certification
   * POST /marketplace/subcontractors/:id/certifications
   */
  @Post('subcontractors/:id/certifications')
  async addCertification(
    @Param('id') id: string,
    @Body() body: AddCertificationDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;

    return this.marketplace.addCertification(tenantId, id, {
      name: body.name,
      issuedBy: body.issuedBy,
      issuedDate: new Date(body.issuedDate),
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
    });
  }

  /**
   * Search subcontractors
   * GET /marketplace/subcontractors/search
   */
  @Get('subcontractors/search/query')
  async searchSubcontractors(@Query() query: SearchSubcontractorsDto, @Request() req: any) {
    const tenantId = req.user.tenantId;

    const filters: any = {};

    if (query.specialties) {
      filters.specialties = query.specialties.split(',');
    }

    if (query.serviceAreas) {
      filters.serviceAreas = query.serviceAreas.split(',');
    }

    if (query.minRating) {
      filters.minRating = parseFloat(query.minRating as any);
    }

    if (query.verified !== undefined) {
      filters.verified = query.verified === true || query.verified === 'true';
    }

    return this.marketplace.searchSubcontractors(tenantId, filters);
  }

  /**
   * Create job posting
   * POST /marketplace/jobs
   */
  @Post('jobs')
  async createJobPosting(@Body() body: CreateJobPostingDto, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    return this.marketplace.createJobPosting(tenantId, userId, {
      ...body,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });
  }

  /**
   * Get job posting
   * GET /marketplace/jobs/:id
   */
  @Get('jobs/:id')
  async getJobPosting(@Param('id') id: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.marketplace.getJobPosting(tenantId, id);
  }

  /**
   * Get all job postings
   * GET /marketplace/jobs
   */
  @Get('jobs')
  async getAllJobPostings(@Query('status') status: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const tenant = await (this.marketplace as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    let postings = (tenant?.settings as any)?.jobPostings || [];

    if (status) {
      postings = postings.filter((p: any) => p.status === status.toUpperCase());
    }

    return {
      total: postings.length,
      postings: postings.sort((a: any, b: any) => b.postedAt - a.postedAt),
    };
  }

  /**
   * Submit bid
   * POST /marketplace/jobs/:id/bids
   */
  @Post('jobs/:id/bids')
  async submitBid(
    @Param('id') id: string,
    @Body() body: SubmitBidDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    // In real app, would get subcontractorId from user profile
    const subcontractorId = req.user.subcontractorId || 'sub_default';

    return this.marketplace.submitBid(tenantId, subcontractorId, id, body);
  }

  /**
   * Accept bid
   * POST /marketplace/jobs/:jobId/bids/:bidId/accept
   */
  @Post('jobs/:jobId/bids/:bidId/accept')
  async acceptBid(
    @Param('jobId') jobId: string,
    @Param('bidId') bidId: string,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    return this.marketplace.acceptBid(tenantId, jobId, bidId);
  }

  /**
   * Complete job
   * POST /marketplace/jobs/:id/complete
   */
  @Post('jobs/:id/complete')
  async completeJob(@Param('id') id: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.marketplace.completeJob(tenantId, id);
  }

  /**
   * Submit review
   * POST /marketplace/jobs/:id/reviews
   */
  @Post('jobs/:id/reviews')
  async submitReview(
    @Param('id') id: string,
    @Body() body: SubmitReviewDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    return this.marketplace.submitReview(tenantId, id, userId, body);
  }

  /**
   * Get subcontractor reviews
   * GET /marketplace/subcontractors/:id/reviews
   */
  @Get('subcontractors/:id/reviews')
  async getSubcontractorReviews(@Param('id') id: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const reviews = await this.marketplace.getSubcontractorReviews(tenantId, id);

    return {
      total: reviews.length,
      reviews,
      averageRating:
        reviews.length > 0
          ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          : 0,
    };
  }

  /**
   * Process payment
   * POST /marketplace/jobs/:id/payment
   */
  @Post('jobs/:id/payment')
  async processPayment(
    @Param('id') id: string,
    @Body() body: ProcessPaymentDto,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    return this.marketplace.processPayment(tenantId, id, body.paymentMethodId);
  }

  /**
   * Get marketplace analytics
   * GET /marketplace/analytics
   */
  @Get('analytics')
  async getAnalytics(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.marketplace.getMarketplaceAnalytics(tenantId);
  }

  /**
   * Get my subcontractor profile
   * GET /marketplace/my-profile
   */
  @Get('my-profile')
  async getMyProfile(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const userId = req.user.userId;

    const tenant = await (this.marketplace as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const profiles = (tenant?.settings as any)?.subcontractorProfiles || [];
    const profile = profiles.find((p: any) => p.userId === userId);

    if (!profile) {
      return { exists: false };
    }

    return { exists: true, profile };
  }

  /**
   * Get my bids
   * GET /marketplace/my-bids
   */
  @Get('my-bids')
  async getMyBids(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const subcontractorId = req.user.subcontractorId || 'sub_default';

    const tenant = await (this.marketplace as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const postings = (tenant?.settings as any)?.jobPostings || [];

    const myBids: any[] = [];

    postings.forEach((posting: any) => {
      posting.bids.forEach((bid: any) => {
        if (bid.subcontractorId === subcontractorId) {
          myBids.push({
            ...bid,
            jobPosting: {
              id: posting.id,
              title: posting.title,
              status: posting.status,
            },
          });
        }
      });
    });

    return {
      total: myBids.length,
      bids: myBids.sort((a, b) => b.submittedAt - a.submittedAt),
    };
  }

  /**
   * Get featured subcontractors
   * GET /marketplace/featured-subcontractors
   */
  @Get('featured-subcontractors')
  async getFeaturedSubcontractors(@Request() req: any) {
    const tenantId = req.user.tenantId;

    const subs = await this.marketplace.searchSubcontractors(tenantId, {
      verified: true,
      minRating: 4.0,
    });

    return {
      total: subs.length,
      subcontractors: subs.slice(0, 10),
    };
  }

  /**
   * Get job statistics
   * GET /marketplace/job-stats
   */
  @Get('job-stats')
  async getJobStats(@Request() req: any) {
    const tenantId = req.user.tenantId;
    const tenant = await (this.marketplace as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const postings = (tenant?.settings as any)?.jobPostings || [];

    const stats = {
      total: postings.length,
      open: postings.filter((p: any) => p.status === 'OPEN').length,
      inProgress: postings.filter((p: any) => p.status === 'IN_PROGRESS').length,
      completed: postings.filter((p: any) => p.status === 'COMPLETED').length,
      cancelled: postings.filter((p: any) => p.status === 'CANCELLED').length,
      totalBids: postings.reduce((sum: number, p: any) => sum + p.bids.length, 0),
      averageBidsPerJob:
        postings.length > 0
          ? postings.reduce((sum: number, p: any) => sum + p.bids.length, 0) /
            postings.length
          : 0,
    };

    return stats;
  }

  /**
   * Get bid statistics
   * GET /marketplace/bid-stats
   */
  @Get('bid-stats')
  async getBidStats(@Query('subcontractorId') subcontractorId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const subId = subcontractorId || req.user.subcontractorId || 'sub_default';

    const tenant = await (this.marketplace as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    const postings = (tenant?.settings as any)?.jobPostings || [];

    let bids: any[] = [];
    postings.forEach((posting: any) => {
      const subBids = posting.bids.filter((b: any) => b.subcontractorId === subId);
      bids = [...bids, ...subBids];
    });

    const stats = {
      total: bids.length,
      pending: bids.filter((b) => b.status === 'PENDING').length,
      accepted: bids.filter((b) => b.status === 'ACCEPTED').length,
      rejected: bids.filter((b) => b.status === 'REJECTED').length,
      withdrawn: bids.filter((b) => b.status === 'WITHDRAWN').length,
      winRate:
        bids.length > 0
          ? (bids.filter((b) => b.status === 'ACCEPTED').length / bids.length) * 100
          : 0,
    };

    return stats;
  }

  /**
   * Withdraw bid
   * POST /marketplace/jobs/:jobId/bids/:bidId/withdraw
   */
  @Post('jobs/:jobId/bids/:bidId/withdraw')
  async withdrawBid(
    @Param('jobId') jobId: string,
    @Param('bidId') bidId: string,
    @Request() req: any,
  ) {
    const tenantId = req.user.tenantId;
    const posting = await this.marketplace.getJobPosting(tenantId, jobId);

    const bid = posting.bids.find((b) => b.id === bidId);
    if (!bid) {
      return { error: 'Bid not found' };
    }

    if (bid.status !== 'PENDING') {
      return { error: 'Can only withdraw pending bids' };
    }

    bid.status = 'WITHDRAWN';

    await (this.marketplace as any).updateJobPosting(tenantId, posting);

    return {
      success: true,
      message: 'Bid withdrawn successfully',
    };
  }

  /**
   * Get payment history
   * GET /marketplace/payments
   */
  @Get('payments')
  async getPayments(@Query('subcontractorId') subcontractorId: string, @Request() req: any) {
    const tenantId = req.user.tenantId;
    const tenant = await (this.marketplace as any).db.tenant.findUnique({
      where: { id: tenantId },
    });
    let payments = (tenant?.settings as any)?.payments || [];

    if (subcontractorId) {
      payments = payments.filter((p: any) => p.subcontractorId === subcontractorId);
    }

    return {
      total: payments.length,
      payments: payments.sort((a: any, b: any) => b.createdAt - a.createdAt),
      totalAmount: payments.reduce(
        (sum: number, p: any) => sum + (p.status === 'COMPLETED' ? p.amount : 0),
        0,
      ),
      totalFees: payments.reduce(
        (sum: number, p: any) => sum + (p.status === 'COMPLETED' ? p.marketplaceFee : 0),
        0,
      ),
    };
  }
}
