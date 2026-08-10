import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType, AppointmentStatus } from '@prisma/client';
import { addDays, addHours, startOfDay, startOfHour } from 'date-fns';

@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(AppointmentReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Send reminders 24 hours before appointment
   * Runs every hour at minute 0
   */
  @Cron(CronExpression.EVERY_HOUR)
  async send24HourReminders() {
    try {
      const tomorrow = startOfDay(addDays(new Date(), 1));
      const endOfTomorrow = addDays(tomorrow, 1);

      const appointments = await this.prisma.appointment.findMany({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startAt: {
            gte: tomorrow,
            lt: endOfTomorrow,
          },
        },
        include: {
          patient: {
            include: {
              user: true,
            },
          },
          psychologist: {
            include: {
              user: true,
            },
          },
        },
      });

      this.logger.log(`Found ${appointments.length} appointments for 24h reminders`);

      for (const appointment of appointments) {
        const sessionTime = appointment.startAt.toLocaleString('fr-FR', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        // Patient reminder
        await this.notificationsService.createInAppNotification(
          appointment.patient.userId,
          'Rappel de rendez-vous',
          `Votre consultation avec le Dr. ${appointment.psychologist.firstName} ${appointment.psychologist.lastName} est prévue demain à ${sessionTime}.`,
          NotificationType.APPOINTMENT_REMINDER,
          { appointmentId: appointment.id },
        );

        // Psychologist reminder
        await this.notificationsService.createInAppNotification(
          appointment.psychologist.userId,
          'Rappel de consultation',
          `Consultation avec ${appointment.patient.firstName} ${appointment.patient.lastName} prévue demain à ${sessionTime}.`,
          NotificationType.APPOINTMENT_REMINDER,
          { appointmentId: appointment.id },
        );

        this.logger.log(`24h reminder sent for appointment ${appointment.id}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send 24h reminders: ${error.message}`);
    }
  }

  /**
   * Send reminders 1 hour before appointment
   * Runs every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async send1HourReminders() {
    try {
      const oneHourFromNow = addHours(new Date(), 1);
      const oneHourAndFiveMinutes = addHours(new Date(), 1.083); // 1 hour + 5 minutes

      const appointments = await this.prisma.appointment.findMany({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startAt: {
            gte: oneHourFromNow,
            lt: oneHourAndFiveMinutes,
          },
        },
        include: {
          patient: {
            include: {
              user: true,
            },
          },
          psychologist: {
            include: {
              user: true,
            },
          },
        },
      });

      this.logger.log(`Found ${appointments.length} appointments for 1h reminders`);

      for (const appointment of appointments) {
        const sessionTime = appointment.startAt.toLocaleString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Patient reminder
        await this.notificationsService.createInAppNotification(
          appointment.patient.userId,
          'Rappel de rendez-vous',
          `Votre consultation commence dans 1 heure à ${sessionTime}. Préparez-vous à rejoindre la session.`,
          NotificationType.APPOINTMENT_REMINDER,
          { appointmentId: appointment.id },
        );

        // Psychologist reminder
        await this.notificationsService.createInAppNotification(
          appointment.psychologist.userId,
          'Rappel de consultation',
          `Consultation avec ${appointment.patient.firstName} ${appointment.patient.lastName} commence dans 1 heure à ${sessionTime}.`,
          NotificationType.APPOINTMENT_REMINDER,
          { appointmentId: appointment.id },
        );

        this.logger.log(`1h reminder sent for appointment ${appointment.id}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send 1h reminders: ${error.message}`);
    }
  }

  /**
   * Send reminders 15 minutes before appointment
   * Runs every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async send15MinuteReminders() {
    try {
      const fifteenMinutesFromNow = addHours(new Date(), 0.25); // 15 minutes
      const sixteenMinutesFromNow = addHours(new Date(), 0.267); // 16 minutes

      const appointments = await this.prisma.appointment.findMany({
        where: {
          status: AppointmentStatus.CONFIRMED,
          startAt: {
            gte: fifteenMinutesFromNow,
            lt: sixteenMinutesFromNow,
          },
        },
        include: {
          patient: {
            include: {
              user: true,
            },
          },
          psychologist: {
            include: {
              user: true,
            },
          },
        },
      });

      this.logger.log(`Found ${appointments.length} appointments for 15min reminders`);

      for (const appointment of appointments) {
        const sessionTime = appointment.startAt.toLocaleString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        });

        // Patient reminder
        await this.notificationsService.createInAppNotification(
          appointment.patient.userId,
      'Rappel de rendez-vous',
          `Votre consultation commence dans 15 minutes à ${sessionTime}. Vous pouvez rejoindre la salle d'attente maintenant.`,
          NotificationType.APPOINTMENT_REMINDER,
          { appointmentId: appointment.id },
        );

        // Psychologist reminder
        await this.notificationsService.createInAppNotification(
          appointment.psychologist.userId,
          'Rappel de consultation',
          `Consultation avec ${appointment.patient.firstName} ${appointment.patient.lastName} commence dans 15 minutes à ${sessionTime}.`,
          NotificationType.APPOINTMENT_REMINDER,
          { appointmentId: appointment.id },
        );

        this.logger.log(`15min reminder sent for appointment ${appointment.id}`);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send 15min reminders: ${error.message}`);
    }
  }

  /**
   * Manual trigger for testing or immediate reminders
   */
  async sendManualReminder(appointmentId: string) {
    try {
      const appointment = await this.prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
          patient: {
            include: {
              user: true,
            },
          },
          psychologist: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!appointment) {
        throw new Error('Appointment not found');
      }

      const sessionTime = appointment.startAt.toLocaleString('fr-FR', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      // Patient reminder
      await this.notificationsService.createInAppNotification(
        appointment.patient.userId,
        'Rappel de rendez-vous',
        `Votre consultation avec le Dr. ${appointment.psychologist.firstName} ${appointment.psychologist.lastName} est prévue le ${sessionTime}.`,
        NotificationType.APPOINTMENT_REMINDER,
        { appointmentId: appointment.id },
      );

      // Psychologist reminder
      await this.notificationsService.createInAppNotification(
        appointment.psychologist.userId,
        'Rappel de consultation',
        `Consultation avec ${appointment.patient.firstName} ${appointment.patient.lastName} prévue le ${sessionTime}.`,
        NotificationType.APPOINTMENT_REMINDER,
        { appointmentId: appointment.id },
      );

      this.logger.log(`Manual reminder sent for appointment ${appointmentId}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send manual reminder: ${error.message}`);
      throw error;
    }
  }
}