import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ReviewsRepository } from './reviews.repository';
import { PsychologistsRepository } from '../psychologists/psychologists.repository';
import { PrismaService } from '../../database/prisma.service';
import { CreateReviewDto } from './dto/review.dto';
import { AppointmentStatus } from '@prisma/client';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly psychologistsRepository: PsychologistsRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createReview(userId: string, dto: CreateReviewDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });
    if (!patient) {
      throw new NotFoundException('Patient profile not found.');
    }

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    if (appointment.patientId !== patient.id) {
      throw new BadRequestException('You can only review appointments booked by you.');
    }

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      await this.prisma.appointment.update({
        where: { id: dto.appointmentId },
        data: { status: AppointmentStatus.COMPLETED },
      });
      await this.prisma.appointmentHistory.create({
        data: {
          appointmentId: dto.appointmentId,
          fromStatus: AppointmentStatus.CONFIRMED,
          toStatus: AppointmentStatus.COMPLETED,
          changedBy: userId,
          reason: 'Session completed via review submission.',
        },
      });
    } else if (appointment.status !== AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Reviews are only allowed for completed sessions.');
    }

    const existingReview = await this.reviewsRepository.findByAppointmentId(dto.appointmentId);
    if (existingReview) {
      throw new ConflictException('You have already reviewed this appointment.');
    }

    const review = await this.reviewsRepository.create({
      patient: { connect: { id: patient.id } },
      psychologist: { connect: { id: appointment.psychologistId } },
      appointment: { connect: { id: appointment.id } },
      rating: dto.rating,
      comment: dto.comment,
      isAnonymous: dto.isAnonymous ?? false,
    });

    // Recalculate average rating of the psychologist async/sync
    await this.psychologistsRepository.updateRating(appointment.psychologistId);

    return review;
  }

  async getPsychologistReviews(psychologistId: string, page: number, limit: number) {
    const psychologist = await this.prisma.psychologist.findUnique({
      where: { id: psychologistId },
    });
    if (!psychologist) {
      throw new NotFoundException('Psychologist not found.');
    }
    return this.reviewsRepository.findAllByPsychologist(psychologistId, page, limit);
  }

  async getAllReviews(page: number, limit: number) {
    return this.reviewsRepository.findAll(page, limit);
  }

  async updateVisibility(adminUserId: string, reviewId: string, isVisible: boolean) {
    const review = await this.reviewsRepository.findById(reviewId);
    if (!review) {
      throw new NotFoundException('Review not found.');
    }

    const updated = await this.reviewsRepository.update(reviewId, {
      isVisible,
      moderatedAt: new Date(),
      moderatedBy: adminUserId,
    });

    await this.psychologistsRepository.updateRating(review.psychologistId);

    return updated;
  }
}
