import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class TasksService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(tenantId: string) {
    return this.db.task.findMany({
      where: { tenantId },
      include: {
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    return this.db.task.findFirst({
      where: { id, tenantId },
      include: {
        assignedTo: true,
      },
    });
  }

  async create(tenantId: string, data: any) {
    return this.db.task.create({
      data: { ...data, tenantId },
    });
  }

  async update(id: string, data: any) {
    return this.db.task.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.task.delete({
      where: { id },
    });
  }
}
