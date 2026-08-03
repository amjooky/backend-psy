import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { SessionFormat, AppointmentStatus } from '@prisma/client';

export class BookAppointmentDto {
  @ApiProperty({ example: 'd0b6e159-86bd-4df7-9ad8-2b819f7e53f1' })
  @IsUUID()
  @IsNotEmpty()
  psychologistId!: string;

  @ApiProperty({ example: '2026-07-10T10:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startAt!: string;

  @ApiProperty({ enum: SessionFormat, default: SessionFormat.VIDEO })
  @IsEnum(SessionFormat)
  @IsNotEmpty()
  sessionFormat!: SessionFormat;

  @ApiPropertyOptional({ example: 'I have been feeling anxious lately.' })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelAppointmentDto {
  @ApiProperty({ example: 'The schedule is conflicting with my classes.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class RescheduleAppointmentDto {
  @ApiProperty({ example: '2026-07-12T14:00:00.000Z' })
  @IsDateString()
  @IsNotEmpty()
  startAt!: string;

  @ApiPropertyOptional({ example: 'Change of schedule.' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class AppointmentQueryDto {
  @ApiPropertyOptional({ enum: AppointmentStatus })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @ApiPropertyOptional({ example: '2026-07-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31T23:59:59.000Z' })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number = 20;
}
