import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserRole, AppointmentStatus, PaymentStatus, PsychologistStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboardStats() {
    const [
      totalPatients,
      totalPsychologists,
      activeSessions,
      revenueResult,
    ] = await Promise.all([
      this.prisma.patient.count(),
      this.prisma.psychologist.count({ where: { status: PsychologistStatus.ACTIVE } }),
      this.prisma.appointment.count({ where: { status: AppointmentStatus.CONFIRMED } }),
      this.prisma.payment.aggregate({
        where: { status: PaymentStatus.COMPLETED },
        _sum: { amount: true },
      }),
    ]);

    return {
      stats: {
        totalPatients,
        totalPsychologists,
        activeSessions,
        totalRevenue: revenueResult._sum.amount || 0,
      },
    };
  }

  async getRevenueReports() {
    const payments = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.COMPLETED },
      select: {
        amount: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      payments,
    };
  }

  async listUsers(page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          patient: { select: { firstName: true, lastName: true } },
          psychologist: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.user.count(),
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
  async banUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });
  }

  async activateUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: userId },
      data: { isActive: true },
    });
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.user.delete({ where: { id: userId } });
    return { message: 'User deleted successfully' };
  }
}
