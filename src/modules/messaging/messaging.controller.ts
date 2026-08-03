import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { MessagingService } from './messaging.service';
import { SendMessageDto, CreateConversationDto } from './dto/messaging.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { FILE_LIMITS } from '../../common/constants/app.constants';

@ApiTags('Messaging')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('messaging')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post('conversations')
  @ApiOperation({ summary: 'Create a new conversation channel' })
  async createConvo(@CurrentUser() user: JwtPayload, @Body() dto: CreateConversationDto) {
    return this.messagingService.createConversation(user.sub, user.role, dto);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'List all conversation channels for current user' })
  async listConvos(@CurrentUser() user: JwtPayload) {
    return this.messagingService.getConversations(user.sub, user.role);
  }

  @Post('messages')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: FILE_LIMITS.AUDIO_MAX_SIZE }, // Max limit fits audio/pdf/images
      fileFilter: (req, file, cb) => {
        const allowedTypes = [
          ...FILE_LIMITS.ALLOWED_IMAGE_TYPES,
          ...FILE_LIMITS.ALLOWED_DOCUMENT_TYPES,
          ...FILE_LIMITS.ALLOWED_AUDIO_TYPES,
        ];
        if ((allowedTypes as string[]).includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Unsupported file type attachment.'), false);
        }
      },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Send message with optional attachment (Image/PDF/Audio)' })
  async sendMessage(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendMessageDto,
    @UploadedFile() file?: any,
  ) {
    return this.messagingService.sendMessage(user.sub, user.role, dto, file);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get message history of a conversation channel' })
  async getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagingService.getMessages(user.sub, user.role, id);
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Mark all messages in conversation as read' })
  async markRead(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.messagingService.markAsRead(user.sub, user.role, id);
  }
}
