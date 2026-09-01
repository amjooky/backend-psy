import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PsychologistStatus } from '@prisma/client';
import { PsychologistsRepository } from './psychologists.repository';
import { RedisService } from '../../redis/redis.service';
import {
  UpdatePsychologistProfileDto,
  UpdateSpecialtiesDto,
  AddCertificateDto,
  SetVacationModeDto,
  UpdateAvailabilityDto,
  PsychologistQueryDto,
  CreateAvailabilityExceptionDto,
} from './dto/psychologist.dto';
import { CACHE_KEYS } from '../../common/constants/app.constants';
import { CertificateStatus, NotificationType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PsychologistsService {
  constructor(
    private readonly psychologistsRepository: PsychologistsRepository,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────

  async findAll(query: PsychologistQueryDto) {
    return this.psychologistsRepository.findAll(query);
  }

  async findPublicById(id: string) {
    const psy = await this.psychologistsRepository.findById(id);
    if (!psy || psy.status !== PsychologistStatus.ACTIVE) {
      throw new NotFoundException('Psychologist not found');
    }
    return psy;
  }

  // ─── Own Profile ─────────────────────────────────────────────

  async getMyProfile(userId: string) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');
    return psy;
  }

  async updateProfile(userId: string, dto: UpdatePsychologistProfileDto) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    const updated = await this.psychologistsRepository.update(psy.id, {
      ...(dto.firstName && { firstName: dto.firstName.trim() }),
      ...(dto.lastName && { lastName: dto.lastName.trim() }),
      ...(dto.licenseNumber && { licenseNumber: dto.licenseNumber.trim() }),
      ...(dto.isProfileComplete !== undefined && { isProfileComplete: dto.isProfileComplete }),
      ...(dto.biography !== undefined && { biography: dto.biography }),
      ...(dto.phoneNumber !== undefined && { phoneNumber: dto.phoneNumber }),
      ...(dto.yearsOfExperience !== undefined && { yearsOfExperience: dto.yearsOfExperience }),
      ...(dto.sessionFormats && { sessionFormats: { set: dto.sessionFormats } }),
      ...(dto.languages && { languages: { set: dto.languages } }),
      ...(dto.timezone && { timezone: dto.timezone }),
      ...(dto.pricePerSession && { pricePerSession: parseFloat(dto.pricePerSession) }),
      ...(dto.currency && { currency: dto.currency }),
      ...(dto.sessionDurationMins && { sessionDurationMins: dto.sessionDurationMins }),
      ...(dto.fcmToken !== undefined && { fcmToken: dto.fcmToken }),
    });

    // Check profile completeness
    await this.checkProfileCompleteness(psy.id);

    await this.redisService.del(CACHE_KEYS.PSYCHOLOGIST(psy.id));
    return updated;
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');
    return this.psychologistsRepository.update(psy.id, { avatarUrl });
  }

  // ─── Specialties ─────────────────────────────────────────────

  async updateSpecialties(userId: string, dto: UpdateSpecialtiesDto) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    await this.psychologistsRepository.upsertSpecialties(psy.id, dto.specialties);
    await this.redisService.del(CACHE_KEYS.PSYCHOLOGIST(psy.id));

    return { message: 'Specialties updated', specialties: dto.specialties };
  }

  // ─── Certificates ─────────────────────────────────────────────

  async addCertificate(userId: string, dto: AddCertificateDto, fileUrl?: string) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    const effectiveFileUrl = fileUrl || dto.fileUrl;
    const created = await this.psychologistsRepository.addCertificate(psy.id, {
      title: dto.title,
      issuer: dto.issuer,
      issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : undefined,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      ...(effectiveFileUrl && { fileUrl: effectiveFileUrl }),
    });

    await this.checkProfileCompleteness(psy.id);
    return created;
  }

  async deleteCertificate(userId: string, certificateId: string) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    await this.psychologistsRepository.deleteCertificate(certificateId, psy.id);
    return { message: 'Certificate deleted' };
  }

  async updateCertificateStatus(adminUserId: string, certificateId: string, status: CertificateStatus) {
    const certificate = await this.psychologistsRepository.updateCertificateStatus(
      certificateId,
      status,
      adminUserId,
    );

    const psychologist = await this.psychologistsRepository.findById(certificate.psychologistId);
    if (psychologist) {
      await this.notificationsService.createInAppNotification(
        psychologist.user.id,
        status === CertificateStatus.VERIFIED ? 'Certificat approuve' : 'Certificat rejete',
        status === CertificateStatus.VERIFIED
          ? `Votre certificat "${certificate.title}" a ete approuve par l'administration.`
          : `Votre certificat "${certificate.title}" a ete rejete. Merci de verifier le document soumis.`,
        NotificationType.DOCUMENT_UPLOADED,
        { certificateId: certificate.id, status },
      );
    }

    return {
      message:
        status === CertificateStatus.VERIFIED
          ? 'Certificate approved successfully'
          : 'Certificate rejected successfully',
      certificate,
    };
  }

  async completeKyc(userId: string) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    const updated = await this.psychologistsRepository.update(psy.id, {
      isProfileComplete: true,
      status: PsychologistStatus.PENDING_VERIFICATION,
    });

    await this.notificationsService.createInAppNotification(
      userId,
      'Dossier KYC Transmis',
      'Votre dossier d\'accréditation professionnelle a été transmis avec succès. Notre équipe examine vos diplômes sous 24 à 48 heures.',
      NotificationType.SYSTEM,
      { psychologistId: psy.id },
    );

    await this.redisService.del(CACHE_KEYS.PSYCHOLOGIST(psy.id));
    return {
      message: 'Dossier KYC transmis avec succès',
      psychologist: updated,
    };
  }

  // ─── Availability ─────────────────────────────────────────────

  async updateAvailability(userId: string, dto: UpdateAvailabilityDto) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    // Validate time format
    for (const slot of dto.slots) {
      if (!this.isValidTime(slot.startTime) || !this.isValidTime(slot.endTime)) {
        throw new BadRequestException(`Invalid time format: ${slot.startTime} or ${slot.endTime}`);
      }
      if (slot.startTime >= slot.endTime) {
        throw new BadRequestException('Start time must be before end time');
      }
    }

    await this.psychologistsRepository.upsertAvailability(psy.id, dto.slots);

    // Invalidate availability cache
    await this.redisService.deletePattern(`slots:${psy.id}:*`);

    return { message: 'Availability updated', slots: dto.slots };
  }

  async listAvailabilityExceptions(userId: string) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');
    return this.psychologistsRepository.listAvailabilityExceptions(psy.id);
  }

  async createAvailabilityException(userId: string, dto: CreateAvailabilityExceptionDto) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    const exception = await this.psychologistsRepository.createAvailabilityException(
      psy.id,
      new Date(dto.date),
      dto.reason,
    );
    await this.redisService.deletePattern(`slots:${psy.id}:*`);

    return exception;
  }

  async deleteAvailabilityException(userId: string, exceptionId: string) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    await this.psychologistsRepository.deleteAvailabilityException(exceptionId, psy.id);
    await this.redisService.deletePattern(`slots:${psy.id}:*`);

    return { message: 'Availability exception deleted' };
  }

  // ─── Vacation Mode ────────────────────────────────────────────

  async setVacationMode(userId: string, dto: SetVacationModeDto) {
    const psy = await this.psychologistsRepository.findByUserId(userId);
    if (!psy) throw new NotFoundException('Psychologist profile not found');

    await this.psychologistsRepository.update(psy.id, {
      vacationMode: dto.vacationMode,
      vacationUntil: dto.vacationUntil ? new Date(dto.vacationUntil) : null,
    });

    return {
      message: dto.vacationMode ? 'Vacation mode enabled' : 'Vacation mode disabled',
    };
  }

  // ─── Admin ───────────────────────────────────────────────────

  async findAllAdmin(query: PsychologistQueryDto, status?: PsychologistStatus) {
    return this.psychologistsRepository.findAll(query, status, true);
  }

  async verifyPsychologist(id: string): Promise<{ message: string }> {
    const psy = await this.psychologistsRepository.findById(id);
    if (!psy) throw new NotFoundException('Psychologist not found');

    await this.psychologistsRepository.update(id, {
      status: PsychologistStatus.ACTIVE,
    });

    return { message: 'Psychologist verified and activated' };
  }

  async suspendPsychologist(id: string, reason?: string): Promise<{ message: string }> {
    const psy = await this.psychologistsRepository.findById(id);
    if (!psy) throw new NotFoundException('Psychologist not found');

    await this.psychologistsRepository.update(id, {
      status: PsychologistStatus.SUSPENDED,
    });

    return { message: 'Psychologist suspended' };
  }

  // ─── Private Helpers ─────────────────────────────────────────

  private isValidTime(time: string): boolean {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
  }

  private async checkProfileCompleteness(psychologistId: string): Promise<void> {
    const psy = await this.psychologistsRepository.findById(psychologistId);
    if (!psy) return;

    const isComplete =
      !!psy.biography &&
      !!psy.yearsOfExperience &&
      psy.languages.length > 0 &&
      !!psy.pricePerSession &&
      psy.specialties.length > 0 &&
      psy.sessionFormats.length > 0;

    if (isComplete !== psy.isProfileComplete) {
      await this.psychologistsRepository.update(psychologistId, {
        isProfileComplete: isComplete,
      });
    }
  }
}
