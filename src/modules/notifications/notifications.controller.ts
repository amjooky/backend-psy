import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current notifications for the logged in user' })
  async getNotifications(@CurrentUser('sub') userId: string) {
    const list = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return list;
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification counts total + per type (for sidebar badges)' })
  async getUnreadCounts(@CurrentUser('sub') userId: string) {
    return this.notificationsService.getUnreadCounts(userId);
  }

  @Post('fcm-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or update device FCM push token' })
  async saveFcmToken(
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @Body('token') token: string,
  ) {
    return this.notificationsService.saveFcmToken(userId, role, token);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  async markAllAsRead(@CurrentUser('sub') userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a notification as read' })
  async markAsRead(@CurrentUser('sub') userId: string, @Param('id') id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a single notification' })
  async deleteNotification(
    @CurrentUser('sub') userId: string,
    @Param('id') id: string,
  ) {
    return this.notificationsService.deleteNotification(userId, id);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete all notifications for user' })
  async deleteAllNotifications(@CurrentUser('sub') userId: string) {
    return this.notificationsService.deleteAllNotifications(userId);
  }
}
