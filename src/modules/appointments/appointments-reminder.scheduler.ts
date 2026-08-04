import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AppointmentStatus, NotificationType } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AppointmentsReminderScheduler {
  private readonly logger = new Logger(AppointmentsReminderScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('*/15 * * * *')
  async scanUpcomingAppointments() {
    const now = new Date();
    const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const appointments = await this.prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.CONFIRMED,
        reminderSentAt: null,
        startAt: {
          gte: now,
          lte: next24Hours,
        },
      },
      include: {
        patient: { include: { user: true } },
        psychologist: { include: { user: true } },
      },
    });

    for (const appointment of appointments) {
      const sessionTime = DateTime.fromJSDate(appointment.startAt)
        .setZone(appointment.timezone)
        .toFormat('dd/MM/yyyy HH:mm');
      const isWithinHour = appointment.startAt.getTime() - now.getTime() <= 60 * 60 * 1000;
      const patientTitle = isWithinHour ? 'Consultation dans 1 heure' : 'Rappel de rendez-vous';
      const psychologistTitle = isWithinHour ? 'Consultation dans 1 heure' : 'Rappel de consultation';

      await this.notificationsService.notify(appointment.patient.userId, {
        type: NotificationType.APPOINTMENT_REMINDER,
        title: patientTitle,
        body: isWithinHour
          ? `Votre consultation avec le Dr. ${appointment.psychologist.firstName} ${appointment.psychologist.lastName} commence bientot a ${sessionTime}.`
          : `Votre consultation avec le Dr. ${appointment.psychologist.firstName} ${appointment.psychologist.lastName} est prevue le ${sessionTime}.`,
        extraData: { appointmentId: appointment.id },
        fcmToken: appointment.patient.fcmToken || undefined,
      });

      await this.notificationsService.notify(appointment.psychologist.userId, {
        type: NotificationType.APPOINTMENT_REMINDER,
        title: psychologistTitle,
        body: isWithinHour
          ? `La consultation avec ${appointment.patient.firstName} ${appointment.patient.lastName} commence bientot a ${sessionTime}.`
          : `La consultation avec ${appointment.patient.firstName} ${appointment.patient.lastName} est prevue le ${sessionTime}.`,
        extraData: { appointmentId: appointment.id },
        fcmToken: appointment.psychologist.fcmToken || undefined,
      });

      await this.notificationsService.sendEmail(
        appointment.patient.user.email,
        patientTitle,
        'appointment-reminder',
        {
          recipientName: appointment.patient.firstName,
          psychologistName: `${appointment.psychologist.firstName} ${appointment.psychologist.lastName}`,
          sessionTime,
        },
      );

      await this.notificationsService.sendEmail(
        appointment.psychologist.user.email,
        psychologistTitle,
        'appointment-reminder',
        {
          recipientName: appointment.psychologist.firstName,
          patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
          sessionTime,
        },
      );

      await this.prisma.appointment.update({
        where: { id: appointment.id },
        data: { reminderSentAt: new Date() },
      });
    }

    if (appointments.length > 0) {
      this.logger.log(`Sent reminders for ${appointments.length} appointment(s).`);
    }
  }
}
