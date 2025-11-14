import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LeadStatus } from '@roofing-crm/database';

@Injectable()
export class LeadsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(tenantId: string, status?: LeadStatus) {
    return this.db.lead.findMany({
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
    return this.db.lead.findFirst({
      where: { id, tenantId },
      include: {
        contact: true,
        property: true,
        assignedTo: true,
        stormEvent: true,
        notes: { orderBy: { createdAt: 'desc' } },
        tasks: { orderBy: { dueDate: 'asc' } },
      },
    });
  }

  async create(tenantId: string, data: any) {
    return this.db.lead.create({
      data: {
        ...data,
        tenantId,
      },
    });
  }

  async update(id: string, tenantId: string, data: any) {
    return this.db.lead.update({
      where: { id },
      data,
    });
  }

  async delete(id: string, tenantId: string) {
    return this.db.lead.delete({
      where: { id },
    });
  }
}
