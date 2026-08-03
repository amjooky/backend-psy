import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { PatientsRepository } from './patients.repository';
import { UpdatePatientProfileDto, UpdateMedicalQuestionnaireDto } from './dto/patient.dto';
import { CACHE_KEYS } from '../../common/constants/app.constants';

@Injectable()
export class PatientsService {
  constructor(
    private readonly patientsRepository: PatientsRepository,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async getMyProfile(userId: string) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  async getById(id: string) {
    const patient = await this.patientsRepository.findById(id);
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async updateProfile(userId: string, dto: UpdatePatientProfileDto) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found');

    const updated = await this.patientsRepository.update(patient.id, {
      ...(dto.firstName && { firstName: dto.firstName.trim() }),
      ...(dto.lastName && { lastName: dto.lastName.trim() }),
      ...(dto.gender && { gender: dto.gender }),
      ...(dto.dateOfBirth && { dateOfBirth: new Date(dto.dateOfBirth) }),
      ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
      ...(dto.timezone && { timezone: dto.timezone }),
      ...(dto.preferredLanguage && { preferredLanguage: dto.preferredLanguage }),
      ...(dto.anonymousName !== undefined && { anonymousName: dto.anonymousName }),
      ...(dto.isAnonymous !== undefined && { isAnonymous: dto.isAnonymous }),
      ...(dto.fcmToken !== undefined && { fcmToken: dto.fcmToken }),
    });

    await this.redisService.del(CACHE_KEYS.PATIENT(patient.id));
    return updated;
  }

  async updateMedicalQuestionnaire(
    userId: string,
    dto: UpdateMedicalQuestionnaireDto,
  ) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found');

    return this.patientsRepository.update(patient.id, {
      medicalQuestionnaire: dto.questionnaire as Prisma.InputJsonValue,
    });
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found');
    return this.patientsRepository.update(patient.id, { avatarUrl });
  }

  // ─── Favorites ──────────────────────────────────────────────

  async addFavorite(userId: string, psychologistId: string) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found');

    const psychologist = await this.prisma.psychologist.findUnique({
      where: { id: psychologistId },
      select: { id: true },
    });
    if (!psychologist) throw new NotFoundException('Psychologist not found');

    await this.patientsRepository.addFavorite(patient.id, psychologistId);
    return { message: 'Added to favorites' };
  }

  async removeFavorite(userId: string, psychologistId: string) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found');

    await this.patientsRepository.removeFavorite(patient.id, psychologistId);
    return { message: 'Removed from favorites' };
  }

  async getFavorites(userId: string, page: number, limit: number) {
    const patient = await this.patientsRepository.findByUserId(userId);
    if (!patient) throw new NotFoundException('Patient profile not found');

    return this.patientsRepository.getFavorites(patient.id, page, limit);
  }

  // ─── Admin: List patients ────────────────────────────────────

  async findAll(page: number, limit: number, search?: string) {
    return this.patientsRepository.findAll(page, limit, search);
  }
}
