import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTicketDto, ReplyTicketDto, AssignTicketDto, UpdateTicketStatusDto } from './dto/support.dto';
import { TicketStatus, UserRole } from '@prisma/client';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createTicket(userId: string, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        userId,
        subject: dto.subject,
        body: dto.body,
        priority: dto.priority,
        status: TicketStatus.OPEN,
      },
    });
  }

  async getMyTickets(userId: string) {
    return this.prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTicketDetails(userId: string, userRole: UserRole, id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        replies: {
          include: {
            user: { select: { email: true, role: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Support ticket not found.');
    }

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.SUPER_ADMIN &&
      ticket.userId !== userId
    ) {
      throw new ForbiddenException('Access denied.');
    }

    return ticket;
  }

  async replyToTicket(userId: string, id: string, dto: ReplyTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    const reply = await this.prisma.ticketReply.create({
      data: {
        ticketId: ticket.id,
        userId,
        body: dto.body,
      },
    });

    // Auto update status if user is customer vs admin replies
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const isUserAdmin = user?.role === UserRole.ADMIN || user?.role === UserRole.SUPER_ADMIN;

    await this.prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: isUserAdmin ? TicketStatus.WAITING_FOR_USER : TicketStatus.OPEN,
      },
    });

    return reply;
  }

  // ─── Admin Support Operations ──────────────────────────────────

  async listAllTickets() {
    return this.prisma.supportTicket.findMany({
      include: {
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignTicket(id: string, dto: AssignTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        assigneeId: dto.assigneeId,
        status: TicketStatus.IN_PROGRESS,
      },
    });
  }

  async updateStatus(id: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found.');

    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === TicketStatus.RESOLVED && { resolvedAt: new Date() }),
        ...(dto.status === TicketStatus.CLOSED && { closedAt: new Date() }),
      },
    });
  }
}
