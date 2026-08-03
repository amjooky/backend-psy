import {
  Controller,
  Post,
  Body,
  UseGuards,
  Param,
  Patch,
  Get,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AppointmentsService } from './appointments.service';
import {
  BookAppointmentDto,
  CancelAppointmentDto,
  RescheduleAppointmentDto,
  AppointmentQueryDto,
} from './dto/appointment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Appointments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  @Post('book')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Book a session with a psychologist' })
  async book(@CurrentUser('sub') userId: string, @Body() dto: BookAppointmentDto) {
    return this.appointmentsService.bookAppointment(userId, dto);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a pending or confirmed appointment' })
  async cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelAppointmentDto,
  ) {
    return this.appointmentsService.cancelAppointment(user.sub, user.role, id, dto);
  }

  @Post(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule an appointment (sets state back to pending)' })
  async reschedule(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    return this.appointmentsService.rescheduleAppointment(user.sub, user.role, id, dto);
  }

  @Patch(':id/accept')
  @Roles(UserRole.PSYCHOLOGIST)
  @ApiOperation({ summary: 'Accept a pending appointment' })
  async accept(@CurrentUser('sub') userId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.appointmentsService.acceptAppointment(userId, id);
  }

  @Get()
  @ApiOperation({ summary: 'List user appointments (patient or psychologist)' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: AppointmentQueryDto) {
    return this.appointmentsService.listAppointments(user.sub, user.role, query);
  }
}
