import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class NotesService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(tenantId: string, relatedToId?: string) {
    return this.db.note.findMany({
      where: {
        tenantId,
        ...(relatedToId && { relatedToId }),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(tenantId: string, createdById: string, data: any) {
    return this.db.note.create({
      data: {
        ...data,
        tenantId,
        createdById,
      },
    });
  }

  async update(id: string, data: any) {
    return this.db.note.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.db.note.delete({
      where: { id },
    });
  }
}
