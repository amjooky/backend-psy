import { Injectable } from '@nestjs/common';
import { Prisma, PsychologistStatus, CertificateStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { getPaginationParams, paginate } from '../../common/utils/pagination.util';
import { PsychologistQueryDto } from './dto/psychologist.dto';

const psychologistSelect = {
  id: true,
  firstName: true,
  lastName: true,
  biography: true,
  avatarUrl: true,
  phoneNumber: true,
  licenseNumber: true,
  yearsOfExperience: true,
  sessionFormats: true,
  languages: true,
  timezone: true,
  pricePerSession: true,
  currency: true,
  sessionDurationMins: true,
  status: true,
  vacationMode: true,
  vacationUntil: true,
  rating: true,
  reviewCount: true,
  isProfileComplete: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      isEmailVerified: true,
      isTwoFactorEnabled: true,
      lastLoginAt: true,
    },
  },
  specialties: {
    select: { id: true, specialty: true },
  },
  certificates: {
    select: {
      id: true,
      title: true,
      issuer: true,
      issuedAt: true,
      expiresAt: true,
      status: true,
      fileUrl: true,
    },
  },
  availabilitySlots: {
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      isActive: true,
    },
    orderBy: { dayOfWeek: 'asc' as const },
  },
} satisfies Prisma.PsychologistSelect;

export type PsychologistWithDetails = Prisma.PsychologistGetPayload<{
  select: typeof psychologistSelect;
}>;

@Injectable()
export class PsychologistsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PsychologistWithDetails | null> {
    return this.prisma.psychologist.findUnique({
      where: { id },
      select: psychologistSelect,
    });
  }

  async findByUserId(userId: string): Promise<PsychologistWithDetails | null> {
    return this.prisma.psychologist.findUnique({
      where: { userId },
      select: psychologistSelect,
    });
  }

  async update(
    id: string,
    data: Prisma.PsychologistUpdateInput,
  ): Promise<PsychologistWithDetails> {
    return this.prisma.psychologist.update({
      where: { id },
      data,
      select: psychologistSelect,
    });
  }

  async findAll(
    query: PsychologistQueryDto,
    statusFilter?: PsychologistStatus,
    isAdmin?: boolean,
  ): Promise<PaginatedResponseDto<PsychologistWithDetails>> {
    const { skip, take } = getPaginationParams(query.page || 1, query.limit || 20);

    const where: Prisma.PsychologistWhereInput = {
      ...(statusFilter
        ? { status: statusFilter }
        : isAdmin
          ? {}
          : { status: PsychologistStatus.ACTIVE }),
      ...(isAdmin ? {} : { vacationMode: false }),
      ...(query.search && {
        AND: query.search
          .split(/\s+/)
          .map((token) => token.trim())
          .filter(Boolean)
          .map((token) => ({
            OR: [
              { firstName: { contains: token, mode: 'insensitive' } },
              { lastName: { contains: token, mode: 'insensitive' } },
              { biography: { contains: token, mode: 'insensitive' } },
              { languages: { has: token } },
              {
                specialties: {
                  some: {
                    specialty: { contains: token, mode: 'insensitive' },
                  },
                },
              },
            ],
          })),
      }),
      ...(query.specialty && {
        specialties: { some: { specialty: { contains: query.specialty, mode: 'insensitive' } } },
      }),
      ...(query.sessionFormat && {
        sessionFormats: { has: query.sessionFormat },
      }),
      ...(query.language && {
        languages: { has: query.language },
      }),
      ...(query.maxPrice && {
        pricePerSession: { lte: query.maxPrice },
      }),
    };

    const orderBy = this.buildOrderBy(query.sortBy, query.order);

    const [data, total] = await Promise.all([
      this.prisma.psychologist.findMany({
        where,
        select: psychologistSelect,
        orderBy,
        skip,
        take,
      }),
      this.prisma.psychologist.count({ where }),
    ]);

    return paginate(data, total, query.page || 1, query.limit || 20);
  }

  async upsertSpecialties(
    psychologistId: string,
    specialties: string[],
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.psychologistSpecialty.deleteMany({ where: { psychologistId } }),
      this.prisma.psychologistSpecialty.createMany({
        data: specialties.map((specialty) => ({
          psychologistId,
          specialty: specialty.trim(),
        })),
        skipDuplicates: true,
      }),
    ]);
  }

  async addCertificate(
    psychologistId: string,
    data: {
      title: string;
      issuer: string;
      issuedAt?: Date;
      expiresAt?: Date;
    },
  ) {
    return this.prisma.certificate.create({
      data: { psychologistId, ...data },
    });
  }

  async deleteCertificate(id: string, psychologistId: string): Promise<void> {
    await this.prisma.certificate.deleteMany({ where: { id, psychologistId } });
  }

  async updateCertificateStatus(
    id: string,
    status: CertificateStatus,
    verifiedBy: string,
  ) {
    return this.prisma.certificate.update({
      where: { id },
      data: {
        status,
        verifiedBy,
        verifiedAt: status === CertificateStatus.VERIFIED ? new Date() : null,
      },
    });
  }

  async upsertAvailability(
    psychologistId: string,
    slots: Array<{ dayOfWeek: string; startTime: string; endTime: string }>,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.availabilitySlot.deleteMany({ where: { psychologistId } }),
      this.prisma.availabilitySlot.createMany({
        data: slots.map((s) => ({
          psychologistId,
          dayOfWeek: s.dayOfWeek as never,
          startTime: s.startTime,
          endTime: s.endTime,
          isActive: true,
        })),
      }),
    ]);
  }

  async listAvailabilityExceptions(psychologistId: string) {
    if (!(this.prisma as any).availabilityException?.findMany) {
      return [];
    }
    return (this.prisma as any).availabilityException.findMany({
      where: { psychologistId },
      orderBy: { date: 'asc' },
    });
  }

  async createAvailabilityException(psychologistId: string, date: Date, reason?: string) {
    if (!(this.prisma as any).availabilityException?.create) {
      return { id: 'temp', psychologistId, date, reason };
    }
    return (this.prisma as any).availabilityException.create({
      data: { psychologistId, date, reason },
    });
  }

  async deleteAvailabilityException(id: string, psychologistId: string) {
    if (!(this.prisma as any).availabilityException?.deleteMany) {
      return;
    }
    await (this.prisma as any).availabilityException.deleteMany({
      where: { id, psychologistId },
    });
  }

  async updateRating(psychologistId: string): Promise<void> {
    const result = await this.prisma.review.aggregate({
      where: { psychologistId, isVisible: true },
      _avg: { rating: true },
      _count: { rating: true },
    });

    await this.prisma.psychologist.update({
      where: { id: psychologistId },
      data: {
        rating: result._avg.rating ?? 0,
        reviewCount: result._count.rating,
      },
    });
  }

  private buildOrderBy(
    sortBy?: string,
    order: 'asc' | 'desc' = 'desc',
  ): Prisma.PsychologistOrderByWithRelationInput {
    const map: Record<string, Prisma.PsychologistOrderByWithRelationInput> = {
      rating: { rating: order },
      price: { pricePerSession: order },
      experience: { yearsOfExperience: order },
      createdAt: { createdAt: order },
    };
    return map[sortBy || 'rating'] || { rating: 'desc' };
  }
}
