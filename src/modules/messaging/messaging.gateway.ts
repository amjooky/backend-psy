import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards, Logger } from '@nestjs/common';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { PrismaService } from '../../database/prisma.service';

@WebSocketGateway({
  cors: { origin: true, credentials: true },
  namespace: 'chat',
})
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(MessagingGateway.name);
  private userSocketMap = new Map<string, string>(); // userId -> socketId

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const userId = (client.handshake.query.userId || client.handshake.auth?.userId) as string;
    if (userId) {
      client.join(`user:${userId}`);
      this.userSocketMap.set(userId, client.id);
      this.logger.debug(`Socket Client connected: ${client.id} (User: ${userId})`);
    }
  }

  handleDisconnect(client: Socket) {
    for (const [userId, socketId] of this.userSocketMap.entries()) {
      if (socketId === client.id) {
        this.userSocketMap.delete(userId);
        this.logger.debug(`Socket Client disconnected: ${client.id}`);
        break;
      }
    }
  }

  sendToUser(userId: string, event: string, data: any) {
    if (this.server) {
      this.server.to(`user:${userId}`).emit(event, data);
      const socketId = this.userSocketMap.get(userId);
      if (socketId) {
        this.server.to(socketId).emit(event, data);
      }
    }
  }

  /** Returns true if the user currently has an active socket connection */
  isUserOnline(userId: string): boolean {
    return this.userSocketMap.has(userId);
  }

  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { conversationId: string; isTyping: boolean; text?: string },
  ) {
    const userId = client.handshake.query.userId as string;
    client.broadcast.emit(`typing:${data.conversationId}`, { userId, isTyping: data.isTyping, text: data.text });
  }
}
