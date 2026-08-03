import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { MeetingRoomStatus } from '@prisma/client';

@Injectable()
export class JitsiSchedulerService {
  private readonly logger = new Logger(JitsiSchedulerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cron job that executes every 10 minutes to auto-expire past meeting rooms.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleRoomCleanup(): Promise<void> {
    this.logger.log('Starting expired Jitsi meeting rooms cleanup task...');

    const now = new Date();

    const roomsToExpire = await this.prisma.meetingRoom.findMany({
      where: {
        status: MeetingRoomStatus.ACTIVE,
        expiresAt: { lt: now },
      },
      select: { id: true, roomName: true },
    });

    if (roomsToExpire.length === 0) {
      this.logger.log('No expired Jitsi meeting rooms found.');
      return;
    }

    const roomIds = roomsToExpire.map((r) => r.id);

    await this.prisma.$transaction(async (tx) => {
      // Transition status to EXPIRED
      await tx.meetingRoom.updateMany({
        where: { id: { in: roomIds } },
        data: { status: MeetingRoomStatus.EXPIRED },
      });

      // Insert termination histories record
      for (const room of roomsToExpire) {
        await tx.meetingHistory.create({
          data: {
            meetingRoomId: room.id,
            startedAt: now, // approximated
            endedAt: now,
            durationSecs: 0,
          },
        });

        await tx.meetingLog.create({
          data: {
            meetingRoomId: room.id,
            eventType: 'room_expired',
            details: { expiredAt: now },
          },
        });
      }
    });

    this.logger.log(`Successfully expired ${roomsToExpire.length} Jitsi meeting rooms.`);
  }
}
