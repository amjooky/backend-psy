import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { MessagingGateway } from './messaging.gateway';
import { SendMessageDto, CreateConversationDto } from './dto/messaging.dto';
import { UserRole, MessageType, Prisma, NotificationType } from '@prisma/client';
import { DocumentsService } from '../documents/documents.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: MessagingGateway,
    private readonly documentsService: DocumentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createConversation(userId: string, userRole: UserRole, dto: CreateConversationDto) {
    if (userRole !== UserRole.PATIENT) {
      throw new ForbiddenException('Only patients can initiate conversations.');
    }

    const patient = await this.prisma.patient.findUnique({ where: { userId } });
    if (!patient) throw new NotFoundException('Patient profile not found.');

    const psychologist = await this.prisma.psychologist.findUnique({ where: { id: dto.psychologistId } });
    if (!psychologist) throw new NotFoundException('Psychologist not found.');

    const convo = await this.prisma.conversation.upsert({
      where: {
        patientId_psychologistId: {
          patientId: patient.id,
          psychologistId: psychologist.id,
        },
      },
      create: {
        patientId: patient.id,
        psychologistId: psychologist.id,
      },
      update: {},
    });

    return convo;
  }

  async sendMessage(
    userId: string,
    userRole: UserRole,
    dto: SendMessageDto,
    file?: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  ) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: dto.conversationId },
      include: { patient: true, psychologist: true },
    });

    if (!convo) throw new NotFoundException('Conversation not found.');

    // Verify ownership
    let senderProfileId = '';
    let receiverUserId = '';
    if (userRole === UserRole.PATIENT) {
      if (convo.patient.userId !== userId) throw new ForbiddenException('Access denied.');
      senderProfileId = convo.patient.id;
      receiverUserId = convo.psychologist.userId;
    } else if (userRole === UserRole.PSYCHOLOGIST) {
      if (convo.psychologist.userId !== userId) throw new ForbiddenException('Access denied.');
      senderProfileId = convo.psychologist.id;
      receiverUserId = convo.patient.userId;
    }

    let attachmentUrl = '';
    let mimeType = '';
    let originalName = '';
    let sizeBytes = 0;

    if (file) {
      const upload = await this.documentsService.uploadFile(file, 'chats');
      attachmentUrl = upload.url;
      mimeType = file.mimetype;
      originalName = file.originalname;
      sizeBytes = file.size;
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.message.create({
        data: {
          conversationId: convo.id,
          senderId: senderProfileId,
          content: dto.content,
          type: dto.type,
          attachments: attachmentUrl
            ? {
                create: {
                  url: attachmentUrl,
                  filename: originalName,
                  mimeType,
                  sizeBytes,
                },
              }
            : undefined,
        },
        include: { attachments: true },
      });

      await tx.conversation.update({
        where: { id: convo.id },
        data: { lastMessageAt: new Date() },
      });

      return msg;
    });

    // Notify receiver via socket
    this.gateway.sendToUser(receiverUserId, 'message', message);

    // Notify receiver via socket for active chat view
    this.gateway.sendToUser(receiverUserId, 'message', message);

    // Create in-app notification (persists and emits real-time notification socket event & FCM push)
    try {
      await this.notificationsService.createNotification(receiverUserId, {
        type: NotificationType.NEW_MESSAGE,
        title: 'Nouveau message',
        body: dto.content
          ? dto.content.substring(0, 100)
          : 'Vous avez reçu un message avec une pièce jointe.',
        data: { conversationId: dto.conversationId },
      });
    } catch (err: any) {
      // Never block message delivery due to notification failure
      console.error(`Message notification failed: ${err.message}`);
    }

    return message;
  }

  async getMessages(userId: string, userRole: UserRole, conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { patient: true, psychologist: true },
    });

    if (!convo) throw new NotFoundException('Conversation not found.');

    if (userRole === UserRole.PATIENT && convo.patient.userId !== userId) {
      throw new ForbiddenException('Access denied.');
    }
    if (userRole === UserRole.PSYCHOLOGIST && convo.psychologist.userId !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    return this.prisma.message.findMany({
      where: { conversationId },
      include: { attachments: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getConversations(userId: string, userRole: UserRole) {
    const where: Prisma.ConversationWhereInput = {};
    if (userRole === UserRole.PATIENT) {
      where.patient = { userId };
    } else if (userRole === UserRole.PSYCHOLOGIST) {
      where.psychologist = { userId };
    }

    return this.prisma.conversation.findMany({
      where,
      include: {
        patient: { select: { firstName: true, lastName: true, avatarUrl: true } },
        psychologist: { select: { firstName: true, lastName: true, avatarUrl: true } },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }

  async markAsRead(userId: string, userRole: UserRole, conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { patient: true, psychologist: true },
    });

    if (!convo) throw new NotFoundException('Conversation not found.');

    let receiverProfileId = '';
    if (userRole === UserRole.PATIENT) {
      if (convo.patient.userId !== userId) throw new ForbiddenException('Access denied.');
      receiverProfileId = convo.patient.id;
    } else if (userRole === UserRole.PSYCHOLOGIST) {
      if (convo.psychologist.userId !== userId) throw new ForbiddenException('Access denied.');
      receiverProfileId = convo.psychologist.id;
    }

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: receiverProfileId },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    // Notify other user
    const otherUserId = userRole === UserRole.PATIENT ? convo.psychologist.userId : convo.patient.userId;
    this.gateway.sendToUser(otherUserId, 'read_receipt', { conversationId });

    return { success: true };
  }
}
