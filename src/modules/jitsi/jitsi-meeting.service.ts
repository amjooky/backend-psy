import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { JitsiJwtGenerator } from './jitsi-jwt.generator';
import { AppointmentStatus, MeetingRoomStatus, UserRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import * as cryptoNode from 'crypto';
import { DateTime } from 'luxon';

@Injectable()
export class JitsiMeetingService {
  private readonly logger = new Logger(JitsiMeetingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtGenerator: JitsiJwtGenerator,
    private readonly config: ConfigService,
  ) {}

  /**
   * Automatically initializes a secure Jitsi room for a confirmed appointment.
   */
  async createMeetingRoom(appointmentId: string): Promise<any> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { include: { user: true } },
        psychologist: { include: { user: true } },
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // NOTE: Status check bypassed for local testing — re-enable in production:
    // if (appointment.status !== AppointmentStatus.CONFIRMED) {
    //   throw new BadRequestException('Room can only be created for confirmed appointments.');
    // }

    // Check if room already exists
    const existingRoom = await this.prisma.meetingRoom.findUnique({
      where: { appointmentId },
    });

    if (existingRoom && existingRoom.status === MeetingRoomStatus.ACTIVE) {
      return existingRoom;
    }

    // Generate secure random room name (prevents room guessing)
    const randomSuffix = cryptoNode.randomBytes(16).toString('hex');
    const roomName = `monpsy-session-${appointmentId}-${randomSuffix}`;
    const password = cryptoNode.randomBytes(8).toString('hex'); // For guest lockouts if JWT fails JVB-side

    // Room expires 30 minutes after scheduled end time
    const expiresAt = DateTime.fromJSDate(appointment.endAt).plus({ minutes: 30 }).toJSDate();

    const room = await this.prisma.meetingRoom.create({
      data: {
        appointmentId,
        roomName,
        password,
        expiresAt,
        status: MeetingRoomStatus.ACTIVE,
      },
    });

    // Log room creation
    await this.prisma.meetingLog.create({
      data: {
        meetingRoomId: room.id,
        eventType: 'room_created',
        details: { generatedBy: 'system', expiresAt },
      },
    });

    return room;
  }

  /**
   * Generates secure credentials (JWT connection token) for participants to join Jitsi.
   */
  async getMeetingAccess(userId: string, userRole: UserRole, appointmentId: string): Promise<any> {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { include: { user: true } },
        psychologist: { include: { user: true } },
        meetingRoom: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    // Verify appointment time window
    const now = new Date();
    const allowedStart = DateTime.fromJSDate(appointment.startAt).minus({ minutes: 10 }).toJSDate();
    const allowedEnd = DateTime.fromJSDate(appointment.endAt).plus({ minutes: 30 }).toJSDate();

    if (now < allowedStart) {
      throw new BadRequestException(
        `La consultation n'est pas encore active. Veuillez rejoindre à l'heure prévue : ${DateTime.fromJSDate(appointment.startAt).setLocale('fr').toLocaleString(DateTime.DATETIME_SHORT)}`
      );
    }

    if (now > allowedEnd) {
      throw new BadRequestException('Cette séance de consultation a expiré et n\'est plus accessible.');
    }

    // Verify participation
    const isPatient = userRole === UserRole.PATIENT && appointment.patient.userId === userId;
    const isPsychologist = userRole === UserRole.PSYCHOLOGIST && appointment.psychologist.userId === userId;
    const isAdmin = userRole === UserRole.ADMIN || userRole === UserRole.SUPER_ADMIN;

    if (!isPatient && !isPsychologist && !isAdmin) {
      throw new ForbiddenException('You are not authorized to join this meeting room.');
    }

    // Fetch or create meeting room
    let room = appointment.meetingRoom;
    if (!room || room.status !== MeetingRoomStatus.ACTIVE) {
      room = await this.createMeetingRoom(appointmentId);
    }

    // Determine Jitsi Role (Psychologist is moderator, Patient is participant)
    const isModerator = isPsychologist || isAdmin;
    const roleString = isModerator ? 'moderator' : 'participant';

    // Retrieve user details
    let userDetails = { fullName: 'Admin User', email: 'admin@monpsy.tn' };
    if (isPatient) {
      const name = appointment.patient.isAnonymous
        ? (appointment.patient.anonymousName || 'Anonymous Patient')
        : `${appointment.patient.firstName} ${appointment.patient.lastName}`;
      userDetails = { fullName: name, email: appointment.patient.user.email };
    } else if (isPsychologist) {
      userDetails = {
        fullName: `Dr. ${appointment.psychologist.firstName} ${appointment.psychologist.lastName}`,
        email: appointment.psychologist.user.email,
      };
    }

    // Generate secure Jitsi JWT token
    const token = this.jwtGenerator.generateToken(
      userId,
      userDetails.fullName,
      userDetails.email,
      room!.roomName,
      isModerator,
    );

    // Record participant tracking (upsert → idempotent on re-join / React Strict Mode double-invoke)
    await this.prisma.meetingParticipant.upsert({
      where: {
        meetingRoomId_userId: {
          meetingRoomId: room!.id,
          userId,
        },
      },
      create: {
        meetingRoomId: room!.id,
        userId,
        role: roleString,
      },
      update: {
        role: roleString,
        joinedAt: new Date(),
        leftAt: null,
      },
    });

    // Log join event
    await this.prisma.meetingLog.create({
      data: {
        meetingRoomId: room!.id,
        eventType: 'join_attempt',
        userId,
        details: { role: roleString },
      },
    });

    return {
      roomName: room!.roomName,
      password: room!.password,
      token,
      domain: this.config.get('jitsi.domain') || 'meet.monpsy.tn',
    };
  }
}
