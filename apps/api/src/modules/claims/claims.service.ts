import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CreateClaimDto {
  jobId: string;
  claimNumber?: string;
  carrier?: string;
  policyNumber?: string;
  adjusterName?: string;
  adjusterPhone?: string;
  adjusterEmail?: string;
  dateOfLoss?: Date;
  causeOfLoss?: string;
  rcv?: number;
  acv?: number;
  deductible?: number;
}

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Create insurance claim for a job
   */
  async create(tenantId: string, dto: CreateClaimDto) {
    // Calculate initial values
    const depreciation = dto.rcv && dto.acv ? dto.rcv - dto.acv : 0;
    const recoverable = depreciation;

    return this.db.insuranceClaim.create({
      data: {
        tenantId,
        ...dto,
        depreciation,
        recoverable,
        initialAmount: dto.rcv,
        totalApproved: dto.rcv,
      },
    });
  }

  /**
   * Get claim by job ID
   */
  async findByJobId(jobId: string, tenantId: string) {
    return this.db.insuranceClaim.findFirst({
      where: { jobId, tenantId },
      include: {
        supplements: true,
        job: {
          include: {
            contact: true,
            property: true,
          },
        },
      },
    });
  }

  /**
   * Update claim
   */
  async update(claimId: string, data: Partial<CreateClaimDto>) {
    return this.db.insuranceClaim.update({
      where: { id: claimId },
      data,
    });
  }

  /**
   * Update claim status
   */
  async updateStatus(
    claimId: string,
    status: string,
    metadata?: Record<string, any>
  ) {
    const updateData: any = { status };

    // Set timestamp based on status
    switch (status) {
      case 'FILED':
        updateData.filedAt = new Date();
        break;
      case 'APPROVED':
        updateData.approvedAt = new Date();
        break;
      case 'DENIED':
        updateData.deniedAt = new Date();
        break;
      case 'PAID':
        updateData.paidAt = new Date();
        break;
    }

    return this.db.insuranceClaim.update({
      where: { id: claimId },
      data: updateData,
    });
  }

  /**
   * Add supplement to claim
   */
  async addSupplement(
    claimId: string,
    data: {
      description: string;
      amount: number;
      documents?: any[];
      notes?: string;
    }
  ) {
    // Get current supplements to calculate next number
    const claim = await this.db.insuranceClaim.findUnique({
      where: { id: claimId },
      include: { supplements: true },
    });

    const nextNumber = claim.supplements.length + 1;

    const supplement = await this.db.supplement.create({
      data: {
        claimId,
        number: nextNumber,
        ...data,
      },
    });

    // Update claim total
    await this.db.insuranceClaim.update({
      where: { id: claimId },
      data: {
        supplementAmount: {
          increment: data.amount,
        },
        totalApproved: {
          increment: data.amount,
        },
      },
    });

    return supplement;
  }

  /**
   * Approve supplement
   */
  async approveSupplement(supplementId: string) {
    return this.db.supplement.update({
      where: { id: supplementId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
      },
    });
  }

  /**
   * Calculate claim financials
   */
  calculateFinancials(claim: any) {
    const rcv = claim.rcv || 0;
    const acv = claim.acv || 0;
    const deductible = claim.deductible || 0;
    const supplementAmount = claim.supplementAmount || 0;

    const depreciation = rcv - acv;
    const totalClaim = rcv + supplementAmount;
    const initialPayment = acv - deductible;
    const recoverableDepreciation = depreciation;
    const homeownerOwes = deductible;

    return {
      totalClaim,
      initialPayment,
      recoverableDepreciation,
      homeownerOwes,
      insuranceTotal: totalClaim - deductible,
    };
  }

  /**
   * Generate claim summary
   */
  async getClaimSummary(claimId: string) {
    const claim = await this.db.insuranceClaim.findUnique({
      where: { id: claimId },
      include: {
        supplements: true,
        job: true,
      },
    });

    const financials = this.calculateFinancials(claim);

    return {
      claim,
      financials,
      timeline: {
        filed: claim.filedAt,
        approved: claim.approvedAt,
        paid: claim.paidAt,
      },
      supplements: {
        count: claim.supplements.length,
        total: claim.supplementAmount,
        approved: claim.supplements.filter(s => s.status === 'APPROVED').length,
      },
    };
  }

  /**
   * Get all claims by status
   */
  async findByStatus(tenantId: string, status: string) {
    return this.db.insuranceClaim.findMany({
      where: { tenantId, status },
      include: {
        job: {
          include: {
            contact: true,
            property: true,
          },
        },
        supplements: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Import Xactimate ESX file
   */
  async importXactimate(claimId: string, esxFileUrl: string) {
    // Placeholder for Xactimate import logic
    // Would parse ESX file and extract line items, totals, etc.

    return this.db.insuranceClaim.update({
      where: { id: claimId },
      data: {
        xactimateFile: esxFileUrl,
      },
    });
  }
}
