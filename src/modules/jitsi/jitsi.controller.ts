import {
  Controller,
  Get,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JitsiMeetingService } from './jitsi-meeting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Consultations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consultations')
export class JitsiController {
  constructor(private readonly meetingService: JitsiMeetingService) {}

  @Get('appointments/:appointmentId/access')
  @ApiOperation({ summary: 'Request JWT access tokens & configs to connect to the Jitsi Meet session' })
  @ApiParam({ name: 'appointmentId', type: 'string', format: 'uuid' })
  async getAccess(
    @CurrentUser() user: JwtPayload,
    @Param('appointmentId', ParseUUIDPipe) appointmentId: string,
  ) {
    return this.meetingService.getMeetingAccess(user.sub, user.role, appointmentId);
  }
}
