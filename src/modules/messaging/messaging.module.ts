import { Module, forwardRef } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { MessagingController } from './messaging.controller';
import { MessagingGateway } from './messaging.gateway';
import { DocumentsModule } from '../documents/documents.module';
import { AuthModule } from '../auth/auth.module';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DocumentsModule, AuthModule, forwardRef(() => NotificationsModule)],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingGateway, WsJwtGuard],
  exports: [MessagingService, MessagingGateway],
})
export class MessagingModule {}
