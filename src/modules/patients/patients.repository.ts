import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { getPaginationParams, paginate } from '../../common/utils/pagination.util';

const patientSelect = {
  id: true,
  firstName: true,
  lastName: true,
  anonymousName: true,
  isAnonymous: true,
  gender: true,
  dateOfBirth: true,
  phoneNumber: true,
  avatarUrl: true,
  timezone: true,
  preferredLanguage: true,
  medicalQuestionnaire: true,
  emergencyContact: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      email: true,
      isEmailVerified: true,
      isTwoFactorEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  },
} satisfies Prisma.PatientSelect;

export type PatientWithUser = Prisma.PatientGetPayload<{
  select: typeof patientSelect;
}>;

@Injectable()
export class PatientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<PatientWithUser | null> {
    return this.prisma.patient.findUnique({
      where: { id },
      select: patientSelect,
    });
  }

  async findByUserId(userId: string): Promise<PatientWithUser | null> {
    return this.prisma.patient.findUnique({
      where: { userId },
      select: patientSelect,
    });
  }

  async update(
    id: string,
    data: Prisma.PatientUpdateInput,
  ): Promise<PatientWithUser> {
    return this.prisma.patient.update({
      where: { id },
      data,
      select: patientSelect,
    });
  }

  async findAll(
    page: number,
    limit: number,
    search?: string,
  ): Promise<PaginatedResponseDto<PatientWithUser>> {
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.PatientWhereInput = search
      ? {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { user: { email: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        select: patientSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async addFavorite(patientId: string, psychologistId: string): Promise<void> {
    await this.prisma.favoritePsychologist.upsert({
      where: { patientId_psychologistId: { patientId, psychologistId } },
      create: { patientId, psychologistId },
      update: {},
    });
  }

  async removeFavorite(patientId: string, psychologistId: string): Promise<void> {
    await this.prisma.favoritePsychologist.deleteMany({
      where: { patientId, psychologistId },
    });
  }

  async getFavorites(patientId: string, page: number, limit: number) {
    const { skip, take } = getPaginationParams(page, limit);

    const [data, total] = await Promise.all([
      this.prisma.favoritePsychologist.findMany({
        where: { patientId },
        include: {
          psychologist: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              rating: true,
              reviewCount: true,
              pricePerSession: true,
              currency: true,
              specialties: { select: { specialty: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.favoritePsychologist.count({ where: { patientId } }),
    ]);

    return paginate(data, total, page, limit);
  }

  async isFavorite(patientId: string, psychologistId: string): Promise<boolean> {
    const count = await this.prisma.favoritePsychologist.count({
      where: { patientId, psychologistId },
    });
    return count > 0;
  }
}
