import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class PropertiesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(tenantId: string) {
    return this.db.property.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    return this.db.property.findFirst({
      where: { id, tenantId },
      include: {
        leads: true,
        jobs: true,
      },
    });
  }

  async create(tenantId: string, data: any) {
    return this.db.property.create({
      data: { ...data, tenantId },
    });
  }

  async update(id: string, data: any) {
    return this.db.property.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.property.delete({
      where: { id },
    });
  }
}
