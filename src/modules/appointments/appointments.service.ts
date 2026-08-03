import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { AppointmentsRepository } from './appointments.repository';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  BookAppointmentDto,
  CancelAppointmentDto,
  RescheduleAppointmentDto,
  AppointmentQueryDto,
} from './dto/appointment.dto';
import { AppointmentStatus, UserRole, Prisma, NotificationType } from '@prisma/client';
import { DateTime } from 'luxon';
import { CACHE_KEYS } from '../../common/constants/app.constants';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly appointmentsRepository: AppointmentsRepository,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async bookAppointment(userId: string, dto: BookAppointmentDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
    });
    if (!patient) {
      throw new NotFoundException('Patient profile not found. Complete your registration.');
    }

    const psychologist = await this.prisma.psychologist.findUnique({
      where: { id: dto.psychologistId },
    });
    if (!psychologist || psychologist.status !== 'ACTIVE') {
      throw new NotFoundException('Psychologist not found or not active.');
    }

    const startTime = DateTime.fromISO(dto.startAt, { zone: psychologist.timezone }).toUTC();
    const endTime = startTime.plus({ minutes: psychologist.sessionDurationMins });

    if (startTime.toJSDate() <= new Date()) {
      throw new BadRequestException('Cannot book appointments in the past.');
    }

    // Verify weekly availability schedule
    const weekdayMap: Record<number, string> = {
      1: 'MONDAY',
      2: 'TUESDAY',
      3: 'WEDNESDAY',
      4: 'THURSDAY',
      5: 'FRIDAY',
      6: 'SATURDAY',
      7: 'SUNDAY',
    };
    const targetLocalTime = startTime.setZone(psychologist.timezone);
    const dayOfWeek = weekdayMap[targetLocalTime.weekday];
    const timeStr = targetLocalTime.toFormat('HH:mm');

    const hasBaseSchedule = await this.prisma.availabilitySlot.findFirst({
      where: {
        psychologistId: psychologist.id,
        dayOfWeek: dayOfWeek as never,
        startTime: { lte: timeStr },
        endTime: { gte: targetLocalTime.plus({ minutes: psychologist.sessionDurationMins }).toFormat('HH:mm') },
        isActive: true,
      },
    });

    if (!hasBaseSchedule) {
      throw new BadRequestException('Chosen time is outside the psychologist weekly working hours.');
    }

    // Check conflict
    const hasConflict = await this.appointmentsRepository.findConflicting(
      psychologist.id,
      startTime.toJSDate(),
      endTime.toJSDate(),
    );

    if (hasConflict) {
      throw new ConflictException('Psychologist is already booked during this time.');
    }

    const appt = await this.appointmentsRepository.create({
      patient: { connect: { id: patient.id } },
      psychologist: { connect: { id: psychologist.id } },
      startAt: startTime.toJSDate(),
      endAt: endTime.toJSDate(),
      timezone: psychologist.timezone,
      status: AppointmentStatus.PENDING,
      sessionFormat: dto.sessionFormat,
      price: psychologist.pricePerSession || new Prisma.Decimal(0),
      currency: psychologist.currency,
      notes: dto.notes,
    });

    await this.appointmentsRepository.createHistory({
      appointmentId: appt.id,
      fromStatus: AppointmentStatus.PENDING,
      toStatus: AppointmentStatus.PENDING,
      changedBy: userId,
      reason: 'Appointment created.',
    });

    // Clear availability cache for that date
    const dateStr = targetLocalTime.toFormat('YYYY-MM-DD');
    await this.redisService.del(CACHE_KEYS.APPOINTMENT_SLOTS(psychologist.id, dateStr));

    // Send in-app notifications
    await this.notificationsService.createInAppNotification(
      psychologist.userId,
      'Nouveau rendez-vous demandé',
      `Le patient ${patient.firstName} ${patient.lastName} a demandé une consultation pour le ${startTime.setZone(psychologist.timezone).toFormat('dd/MM/yyyy à HH:mm')}.`,
      NotificationType.APPOINTMENT_BOOKED,
      { appointmentId: appt.id }
    );

    await this.notificationsService.createInAppNotification(
      userId,
      'Demande de rendez-vous envoyée',
      `Votre demande de rendez-vous avec le Dr. ${psychologist.firstName} ${psychologist.lastName} a été envoyée avec succès.`,
      NotificationType.APPOINTMENT_BOOKED,
      { appointmentId: appt.id }
    );

    return appt;
  }

  async cancelAppointment(userId: string, userRole: UserRole, id: string, dto: CancelAppointmentDto) {
    const appt = await this.appointmentsRepository.findById(id);
    if (!appt) {
      throw new NotFoundException('Appointment not found.');
    }

    // Ownership check
    if (userRole === UserRole.PATIENT && appt.patient.id !== await this.getPatientId(userId)) {
      throw new ForbiddenException('Access denied.');
    }
    if (userRole === UserRole.PSYCHOLOGIST && appt.psychologist.id !== await this.getPsychologistId(userId)) {
      throw new ForbiddenException('Access denied.');
    }

    if (
      appt.status === AppointmentStatus.CANCELLED ||
      appt.status === AppointmentStatus.COMPLETED ||
      appt.status === AppointmentStatus.MISSED
    ) {
      throw new BadRequestException('Appointment is already finalized.');
    }

    const updated = await this.appointmentsRepository.update(id, {
      status: AppointmentStatus.CANCELLED,
      cancellationReason: dto.reason,
      cancelledBy: userId,
      cancelledAt: new Date(),
    });

    await this.appointmentsRepository.createHistory({
      appointmentId: id,
      fromStatus: appt.status,
      toStatus: AppointmentStatus.CANCELLED,
      changedBy: userId,
      reason: dto.reason,
    });

    // Clear cache
    const targetLocal = DateTime.fromJSDate(appt.startAt).setZone(appt.timezone);
    await this.redisService.del(CACHE_KEYS.APPOINTMENT_SLOTS(appt.psychologistId, targetLocal.toFormat('YYYY-MM-DD')));

    // Send in-app notifications
    const recipientUserId = userRole === UserRole.PATIENT ? appt.psychologist.userId : appt.patient.userId;
    const senderName = userRole === UserRole.PATIENT 
      ? `${appt.patient.firstName} ${appt.patient.lastName}`
      : `Dr. ${appt.psychologist.firstName} ${appt.psychologist.lastName}`;
    
    await this.notificationsService.createInAppNotification(
      recipientUserId,
      'Rendez-vous annulé',
      `La consultation prévue le ${DateTime.fromJSDate(appt.startAt).setZone(appt.timezone).toFormat('dd/MM/yyyy à HH:mm')} a été annulée par ${senderName}. Raison: ${dto.reason || 'Non spécifiée'}.`,
      NotificationType.APPOINTMENT_CANCELLED,
      { appointmentId: id }
    );

    await this.notificationsService.createInAppNotification(
      userId,
      'Rendez-vous annulé',
      `Vous avez annulé la consultation prévue le ${DateTime.fromJSDate(appt.startAt).setZone(appt.timezone).toFormat('dd/MM/yyyy à HH:mm')}.`,
      NotificationType.APPOINTMENT_CANCELLED,
      { appointmentId: id }
    );

    return updated;
  }

  async rescheduleAppointment(
    userId: string,
    userRole: UserRole,
    id: string,
    dto: RescheduleAppointmentDto,
  ) {
    const appt = await this.appointmentsRepository.findById(id);
    if (!appt) {
      throw new NotFoundException('Appointment not found.');
    }

    if (userRole === UserRole.PATIENT && appt.patient.id !== await this.getPatientId(userId)) {
      throw new ForbiddenException('Access denied.');
    }
    if (userRole === UserRole.PSYCHOLOGIST && appt.psychologist.id !== await this.getPsychologistId(userId)) {
      throw new ForbiddenException('Access denied.');
    }

    if (appt.status !== AppointmentStatus.PENDING && appt.status !== AppointmentStatus.CONFIRMED) {
      throw new BadRequestException('Only pending or confirmed appointments can be rescheduled.');
    }

    const psychologist = await this.prisma.psychologist.findUnique({
      where: { id: appt.psychologistId },
    });
    if (!psychologist) {
      throw new NotFoundException('Psychologist not found.');
    }

    const startTime = DateTime.fromISO(dto.startAt).toUTC();
    const endTime = startTime.plus({ minutes: psychologist.sessionDurationMins });

    if (startTime.toJSDate() <= new Date()) {
      throw new BadRequestException('Cannot reschedule to the past.');
    }

    const hasConflict = await this.appointmentsRepository.findConflicting(
      appt.psychologistId,
      startTime.toJSDate(),
      endTime.toJSDate(),
      appt.id,
    );

    if (hasConflict) {
      throw new ConflictException('Psychologist has another booking at that time.');
    }

    const updated = await this.appointmentsRepository.update(id, {
      startAt: startTime.toJSDate(),
      endAt: endTime.toJSDate(),
      status: AppointmentStatus.PENDING, // require confirmation again
    });

    await this.appointmentsRepository.createHistory({
      appointmentId: id,
      fromStatus: appt.status,
      toStatus: AppointmentStatus.PENDING,
      changedBy: userId,
      reason: dto.reason || 'Appointment rescheduled.',
    });

    // Invalidate old and new date caches
    const oldLocal = DateTime.fromJSDate(appt.startAt).setZone(appt.timezone);
    const newLocal = startTime.setZone(appt.timezone);
    await this.redisService.del(CACHE_KEYS.APPOINTMENT_SLOTS(appt.psychologistId, oldLocal.toFormat('YYYY-MM-DD')));
    await this.redisService.del(CACHE_KEYS.APPOINTMENT_SLOTS(appt.psychologistId, newLocal.toFormat('YYYY-MM-DD')));

    return updated;
  }

  async acceptAppointment(userId: string, id: string) {
    const psyId = await this.getPsychologistId(userId);
    const appt = await this.appointmentsRepository.findById(id);
    if (!appt || appt.psychologistId !== psyId) {
      throw new NotFoundException('Appointment not found.');
    }

    if (appt.status !== AppointmentStatus.PENDING) {
      throw new BadRequestException('Appointment is not in PENDING status.');
    }

    const updated = await this.appointmentsRepository.update(id, {
      status: AppointmentStatus.CONFIRMED,
      meetingUrl: `https://meet.monpsy.tn/${appt.id}`, // Mock or generate dynamic video link
    });

    await this.appointmentsRepository.createHistory({
      appointmentId: id,
      fromStatus: AppointmentStatus.PENDING,
      toStatus: AppointmentStatus.CONFIRMED,
      changedBy: userId,
      reason: 'Appointment accepted by psychologist.',
    });

    // Send in-app notifications
    await this.notificationsService.createInAppNotification(
      appt.patient.userId,
      'Rendez-vous confirmé !',
      `Le Dr. ${appt.psychologist.firstName} ${appt.psychologist.lastName} a accepté votre demande de consultation pour le ${DateTime.fromJSDate(appt.startAt).setZone(appt.timezone).toFormat('dd/MM/yyyy à HH:mm')}.`,
      NotificationType.APPOINTMENT_CONFIRMED,
      { appointmentId: id }
    );

    await this.notificationsService.createInAppNotification(
      userId,
      'Rendez-vous confirmé',
      `Vous avez accepté la demande de consultation du patient ${appt.patient.firstName} ${appt.patient.lastName} pour le ${DateTime.fromJSDate(appt.startAt).setZone(appt.timezone).toFormat('dd/MM/yyyy à HH:mm')}.`,
      NotificationType.APPOINTMENT_CONFIRMED,
      { appointmentId: id }
    );

    return updated;
  }

  async listAppointments(userId: string, userRole: UserRole, query: AppointmentQueryDto) {
    const where: Prisma.AppointmentWhereInput = {};

    if (userRole === UserRole.PATIENT) {
      where.patient = { userId };
    } else if (userRole === UserRole.PSYCHOLOGIST) {
      where.psychologist = { userId };
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.from || query.to) {
      where.startAt = {};
      if (query.from) {
        where.startAt.gte = new Date(query.from);
      }
      if (query.to) {
        where.startAt.lte = new Date(query.to);
      }
    }

    return this.appointmentsRepository.findAll(where, query.page || 1, query.limit || 20);
  }

  // ─── Helpers ──────────────────────────────────────────────

  private async getPatientId(userId: string): Promise<string> {
    const patient = await this.prisma.patient.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found.');
    return patient.id;
  }

  private async getPsychologistId(userId: string): Promise<string> {
    const psychologist = await this.prisma.psychologist.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!psychologist) throw new NotFoundException('Psychologist not found.');
    return psychologist.id;
  }
}
