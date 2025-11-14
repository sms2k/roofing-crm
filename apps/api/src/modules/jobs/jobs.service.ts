import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { JobStatus } from '@roofing-crm/database';

@Injectable()
export class JobsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(tenantId: string, status?: JobStatus) {
    return this.db.job.findMany({
      where: {
        tenantId,
        ...(status && { status }),
      },
      include: {
        contact: true,
        property: true,
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    return this.db.job.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        property: true,
        assignedTo: true,
        lead: true,
        estimate: true,
        contract: true,
        tasks: { orderBy: { dueDate: 'asc' } },
        notes: { orderBy: { createdAt: 'desc' } },
        workOrders: true,
        invoices: true,
      },
    });
  }

  async create(tenantId: string, data: any) {
    // Generate job number
    const count = await this.db.job.count({ where: { tenantId } });
    const jobNumber = `JOB-${String(count + 1).padStart(5, '0')}`;

    return this.db.job.create({
      data: {
        ...data,
        tenantId,
        jobNumber,
      },
    });
  }

  async update(id: string, data: any) {
    return this.db.job.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.job.delete({
      where: { id },
    });
  }
}
