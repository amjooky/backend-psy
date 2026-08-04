import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { getPaginationParams, paginate } from '../../common/utils/pagination.util';

const reviewSelect = {
  id: true,
  patientId: true,
  psychologistId: true,
  appointmentId: true,
  rating: true,
  comment: true,
  isAnonymous: true,
  isVisible: true,
  createdAt: true,
  updatedAt: true,
  patient: {
    select: {
      id: true,
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
      firstName: true,
      lastName: true,
    },
  },
} satisfies Prisma.ReviewSelect;

export type ReviewWithDetails = Prisma.ReviewGetPayload<{
  select: typeof reviewSelect;
}>;

@Injectable()
export class ReviewsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.ReviewCreateInput): Promise<ReviewWithDetails> {
    return this.prisma.review.create({
      data,
      select: reviewSelect,
    });
  }

  async findById(id: string): Promise<ReviewWithDetails | null> {
    return this.prisma.review.findUnique({
      where: { id },
      select: reviewSelect,
    });
  }

  async findByAppointmentId(appointmentId: string): Promise<ReviewWithDetails | null> {
    return this.prisma.review.findUnique({
      where: { appointmentId },
      select: reviewSelect,
    });
  }

  async findAllByPsychologist(
    psychologistId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResponseDto<ReviewWithDetails>> {
    const { skip, take } = getPaginationParams(page, limit);

    const where: Prisma.ReviewWhereInput = {
      psychologistId,
      isVisible: true,
    };

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        select: reviewSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.review.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async update(id: string, data: Prisma.ReviewUpdateInput): Promise<ReviewWithDetails> {
    return this.prisma.review.update({
      where: { id },
      data,
      select: reviewSelect,
    });
  }

  async findAll(page: number, limit: number): Promise<PaginatedResponseDto<ReviewWithDetails>> {
    const { skip, take } = getPaginationParams(page, limit);

    const [data, total] = await Promise.all([
      this.prisma.review.findMany({
        select: reviewSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.review.count(),
    ]);

    return paginate(data, total, page, limit);
  }
}
