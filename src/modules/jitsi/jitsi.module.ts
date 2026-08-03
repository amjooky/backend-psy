import { Module } from '@nestjs/common';
import { JitsiMeetingService } from './jitsi-meeting.service';
import { JitsiJwtGenerator } from './jitsi-jwt.generator';
import { JitsiSchedulerService } from './jitsi-scheduler.service';
import { JitsiController } from './jitsi.controller';

@Module({
  controllers: [JitsiController],
  providers: [
    JitsiMeetingService,
    JitsiJwtGenerator,
    JitsiSchedulerService,
  ],
  exports: [JitsiMeetingService, JitsiJwtGenerator],
})
export class JitsiModule {}
