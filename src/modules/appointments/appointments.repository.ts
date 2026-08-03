import { Injectable } from '@nestjs/common';
import { Prisma, AppointmentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { getPaginationParams, paginate } from '../../common/utils/pagination.util';

const appointmentSelect = {
  id: true,
  patientId: true,
  psychologistId: true,
  startAt: true,
  endAt: true,
  timezone: true,
  status: true,
  sessionFormat: true,
  price: true,
  currency: true,
  meetingUrl: true,
  notes: true,
  cancellationReason: true,
  cancelledBy: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      isAnonymous: true,
      anonymousName: true,
    },
  },
  psychologist: {
    select: {
      id: true,
      userId: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      timezone: true,
      pricePerSession: true,
      currency: true,
    },
  },
} satisfies Prisma.AppointmentSelect;

export type AppointmentWithDetails = Prisma.AppointmentGetPayload<{
  select: typeof appointmentSelect;
}>;

@Injectable()
export class AppointmentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AppointmentWithDetails | null> {
    return this.prisma.appointment.findUnique({
      where: { id },
      select: appointmentSelect,
    });
  }

  async create(data: Prisma.AppointmentCreateInput): Promise<AppointmentWithDetails> {
    return this.prisma.appointment.create({
      data,
      select: appointmentSelect,
    });
  }

  async update(id: string, data: Prisma.AppointmentUpdateInput): Promise<AppointmentWithDetails> {
    return this.prisma.appointment.update({
      where: { id },
      data,
      select: appointmentSelect,
    });
  }

  async findConflicting(
    psychologistId: string,
    startAt: Date,
    endAt: Date,
    excludeAppointmentId?: string,
  ): Promise<boolean> {
    const conflict = await this.prisma.appointment.findFirst({
      where: {
        psychologistId,
        id: excludeAppointmentId ? { not: excludeAppointmentId } : undefined,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.RESCHEDULED] },
        OR: [
          {
            startAt: { lte: startAt },
            endAt: { gt: startAt },
          },
          {
            startAt: { lt: endAt },
            endAt: { gte: endAt },
          },
          {
            startAt: { gte: startAt },
            endAt: { lte: endAt },
          },
        ],
      },
    });
    return !!conflict;
  }

  async findAll(
    where: Prisma.AppointmentWhereInput,
    page: number,
    limit: number,
  ): Promise<PaginatedResponseDto<AppointmentWithDetails>> {
    const { skip, take } = getPaginationParams(page, limit);

    const [data, total] = await Promise.all([
      this.prisma.appointment.findMany({
        where,
        select: appointmentSelect,
        orderBy: { startAt: 'asc' },
        skip,
        take,
      }),
      this.prisma.appointment.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async createHistory(data: Prisma.AppointmentHistoryUncheckedCreateInput) {
    return this.prisma.appointmentHistory.create({
      data,
    });
  }
}
