import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { DayOfWeek } from '@prisma/client';
import { DateTime } from 'luxon';
import { CACHE_KEYS } from '../../common/constants/app.constants';

export interface TimeSlot {
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  isAvailable: boolean;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Returns slots mapping a specific date for a psychologist, detecting booking conflicts.
   */
  async getAvailabilityForDate(
    psychologistId: string,
    dateString: string, // YYYY-MM-DD
  ): Promise<TimeSlot[]> {
    const cacheKey = CACHE_KEYS.APPOINTMENT_SLOTS(psychologistId, dateString);
    const cached = await this.redis.getJson<TimeSlot[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const psychologist = await this.prisma.psychologist.findUnique({
      where: { id: psychologistId },
      select: {
        id: true,
        timezone: true,
        vacationMode: true,
        vacationUntil: true,
        sessionDurationMins: true,
      },
    });

    if (!psychologist) {
      throw new NotFoundException('Psychologist not found');
    }

    const targetDate = DateTime.fromISO(dateString, { zone: psychologist.timezone });
    if (!targetDate.isValid) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }

    // Check vacation mode
    if (psychologist.vacationMode) {
      if (!psychologist.vacationUntil || targetDate.toJSDate() < psychologist.vacationUntil) {
        return []; // No availability on vacation
      }
    }

    // Determine DayOfWeek
    const weekdayMap: Record<number, DayOfWeek> = {
      1: DayOfWeek.MONDAY,
      2: DayOfWeek.TUESDAY,
      3: DayOfWeek.WEDNESDAY,
      4: DayOfWeek.THURSDAY,
      5: DayOfWeek.FRIDAY,
      6: DayOfWeek.SATURDAY,
      7: DayOfWeek.SUNDAY,
    };
    const dayOfWeek = weekdayMap[targetDate.weekday];

    // Fetch weekly schedule slots
    const baseSlots = await this.prisma.availabilitySlot.findMany({
      where: { psychologistId, dayOfWeek, isActive: true },
    });

    if (baseSlots.length === 0) {
      return [];
    }

    // Fetch appointments for this day
    const startOfDay = targetDate.startOf('day').toJSDate();
    const endOfDay = targetDate.endOf('day').toJSDate();

    const appointments = await this.prisma.appointment.findMany({
      where: {
        psychologistId,
        startAt: { gte: startOfDay, lte: endOfDay },
        status: { in: ['PENDING', 'CONFIRMED', 'RESCHEDULED'] },
      },
      select: { startAt: true, endAt: true },
    });

    const timeSlots: TimeSlot[] = [];
    const duration = psychologist.sessionDurationMins;

    for (const baseSlot of baseSlots) {
      const [startHour, startMin] = baseSlot.startTime.split(':').map(Number);
      const [endHour, endMin] = baseSlot.endTime.split(':').map(Number);

      let slotStart = targetDate.set({ hour: startHour, minute: startMin, second: 0, millisecond: 0 });
      const slotEndLimit = targetDate.set({ hour: endHour, minute: endMin, second: 0, millisecond: 0 });

      while (slotStart.plus({ minutes: duration }) <= slotEndLimit) {
        const currentEnd = slotStart.plus({ minutes: duration });
        const startJS = slotStart.toJSDate();
        const endJS = currentEnd.toJSDate();

        // Conflict check
        const hasConflict = appointments.some((appt) => {
          return (
            (startJS >= appt.startAt && startJS < appt.endAt) ||
            (endJS > appt.startAt && endJS <= appt.endAt) ||
            (startJS <= appt.startAt && endJS >= appt.endAt)
          );
        });

        timeSlots.push({
          startTime: slotStart.toFormat('HH:mm'),
          endTime: currentEnd.toFormat('HH:mm'),
          isAvailable: !hasConflict && startJS > new Date(), // must be in future
        });

        slotStart = currentEnd;
      }
    }

    // Cache slots for 5 minutes
    await this.redis.setJson(cacheKey, timeSlots, 300);

    return timeSlots;
  }
}
