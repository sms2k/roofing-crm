import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class ContactsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(tenantId: string) {
    return this.db.contact.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    return this.db.contact.findFirst({
      where: { id, tenantId },
      include: {
        leads: true,
        jobs: true,
        properties: true,
      },
    });
  }

  async create(tenantId: string, data: any) {
    return this.db.contact.create({
      data: { ...data, tenantId },
    });
  }

  async update(id: string, tenantId: string, data: any) {
    return this.db.contact.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.contact.delete({
      where: { id },
    });
  }
}
