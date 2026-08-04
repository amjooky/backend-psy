import { Module } from '@nestjs/common';
import { PsychologistsController } from './psychologists.controller';
import { PsychologistsService } from './psychologists.service';
import { PsychologistsRepository } from './psychologists.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PsychologistsController],
  providers: [PsychologistsService, PsychologistsRepository],
  exports: [PsychologistsService, PsychologistsRepository],
})
export class PsychologistsModule {}
