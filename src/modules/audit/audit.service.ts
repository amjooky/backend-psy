import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditAction } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    userId: string | null,
    action: AuditAction,
    resource: string,
    resourceId?: string,
    ip?: string,
    userAgent?: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        userId,
        performedBy: userId,
        action,
        resource,
        resourceId,
        ip,
        userAgent,
        metadata: metadata || {},
      },
    });
  }

  async getLogs(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: { email: true, role: true },
          },
        },
      }),
      this.prisma.auditLog.count(),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
