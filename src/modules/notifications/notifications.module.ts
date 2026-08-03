import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailProcessor, PushProcessor } from './notifications.processor';
import { QUEUE_NAMES } from '../../common/constants/app.constants';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    forwardRef(() => MessagingModule),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('bull.redis.host') || 'localhost',
          port: config.get<number>('bull.redis.port') || 6379,
          password: config.get<string>('bull.redis.password') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL },
      { name: QUEUE_NAMES.NOTIFICATIONS },
    ),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailProcessor, PushProcessor],
  exports: [NotificationsService],
})
export class NotificationsModule {}
