import { Test, TestingModule } from '@nestjs/testing';
import { JitsiMeetingService } from './jitsi-meeting.service';
import { JitsiJwtGenerator } from './jitsi-jwt.generator';
import { PrismaService } from '../../database/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppointmentStatus, MeetingRoomStatus, UserRole } from '@prisma/client';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DateTime } from 'luxon';

describe('JitsiMeetingService Integration Spec', () => {
  let service: JitsiMeetingService;
  let prisma: PrismaService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'jitsi.domain') return 'meet.monpsy.tn';
      if (key === 'jitsi.appId') return 'monpsy';
      if (key === 'jitsi.appSecret') return 'jitsiappsecret1234567890jitsiappsecret';
      if (key === 'jitsi.tokenExpiry') return 7200;
      return null;
    }),
  };

  const mockPatient = {
    id: 'patient-uuid-1111',
    userId: 'patient-user-1111',
    firstName: 'Amine',
    lastName: 'Ben Ali',
    isAnonymous: false,
    anonymousName: null,
    user: { email: 'patient@monpsy.tn' },
  };

  const mockPsychologist = {
    id: 'psy-uuid-2222',
    userId: 'psy-user-2222',
    firstName: 'Sonia',
    lastName: 'Trabelsi',
    user: { email: 'psy@monpsy.tn' },
    sessionDurationMins: 60,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JitsiMeetingService,
        JitsiJwtGenerator,
        {
          provide: PrismaService,
          useValue: {
            appointment: {
              findUnique: jest.fn(),
            },
            meetingRoom: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            meetingParticipant: {
              create: jest.fn(),
            },
            meetingLog: {
              create: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<JitsiMeetingService>(JitsiMeetingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMeetingAccess', () => {
    it('should throw NotFoundException if appointment does not exist', async () => {
      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue(null as any);

      await expect(
        service.getMeetingAccess('some-user', UserRole.PATIENT, 'invalid-appt-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not part of the appointment', async () => {
      const now = new Date();
      const mockAppointment = {
        id: 'appt-uuid-9999',
        status: AppointmentStatus.CONFIRMED,
        startAt: DateTime.fromJSDate(now).minus({ minutes: 5 }).toJSDate(),
        endAt: DateTime.fromJSDate(now).plus({ minutes: 55 }).toJSDate(),
        timezone: 'Africa/Tunis',
        patientId: mockPatient.id,
        psychologistId: mockPsychologist.id,
        patient: mockPatient,
        psychologist: mockPsychologist,
        meetingRoom: null,
      };

      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue(mockAppointment as any);

      await expect(
        service.getMeetingAccess('attacker-user-id', UserRole.PATIENT, mockAppointment.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw ForbiddenException if session has not started yet', async () => {
      const futureStart = DateTime.now().plus({ hours: 2 }).toJSDate();
      const futureEnd = DateTime.now().plus({ hours: 3 }).toJSDate();
      const mockAppointment = {
        id: 'appt-uuid-9999',
        status: AppointmentStatus.CONFIRMED,
        startAt: futureStart,
        endAt: futureEnd,
        timezone: 'Africa/Tunis',
        patientId: mockPatient.id,
        psychologistId: mockPsychologist.id,
        patient: mockPatient,
        psychologist: mockPsychologist,
        meetingRoom: null,
      };

      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue(mockAppointment as any);

      await expect(
        service.getMeetingAccess(mockPatient.userId, UserRole.PATIENT, mockAppointment.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should grant access and generate credentials for valid patient join requests', async () => {
      const now = new Date();
      const mockAppointment = {
        id: 'appt-uuid-9999',
        status: AppointmentStatus.CONFIRMED,
        startAt: DateTime.fromJSDate(now).minus({ minutes: 5 }).toJSDate(),
        endAt: DateTime.fromJSDate(now).plus({ minutes: 55 }).toJSDate(),
        timezone: 'Africa/Tunis',
        patientId: mockPatient.id,
        psychologistId: mockPsychologist.id,
        patient: mockPatient,
        psychologist: mockPsychologist,
        meetingRoom: {
          id: 'room-uuid-1111',
          roomName: 'monpsy-session-appt-uuid-9999-randomsuffix',
          password: 'securepassword',
          status: MeetingRoomStatus.ACTIVE,
        },
      };

      jest.spyOn(prisma.appointment, 'findUnique').mockResolvedValue(mockAppointment as any);

      const result = await service.getMeetingAccess(
        mockPatient.userId,
        UserRole.PATIENT,
        mockAppointment.id,
      );

      expect(result).toBeDefined();
      expect(result.roomName).toBe(mockAppointment.meetingRoom.roomName);
      expect(result.password).toBe(mockAppointment.meetingRoom.password);
      expect(result.token).toBeDefined();
      expect(result.domain).toBe('meet.monpsy.tn');
    });
  });
});
