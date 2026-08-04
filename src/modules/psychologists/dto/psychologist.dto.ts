import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DayOfWeek, SessionFormat } from '@prisma/client';

export class UpdatePsychologistProfileDto {
  @ApiPropertyOptional({ example: 'Sonia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Trabelsi' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'Spécialisée en thérapie cognitive-comportementale...' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  biography?: string;

  @ApiPropertyOptional({ example: '+21698765432' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  yearsOfExperience?: number;

  @ApiPropertyOptional({ enum: SessionFormat, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SessionFormat, { each: true })
  sessionFormats?: SessionFormat[];

  @ApiPropertyOptional({ example: ['fr', 'ar', 'en'], description: 'Language codes' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  languages?: string[];

  @ApiPropertyOptional({ example: 'Africa/Tunis' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ example: '80.00', description: 'Price per session' })
  @IsOptional()
  @IsString()
  pricePerSession?: string;

  @ApiPropertyOptional({ example: 'TND' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 60, description: 'Session duration in minutes' })
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(180)
  sessionDurationMins?: number;

  @ApiPropertyOptional({ description: 'FCM push notification token' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fcmToken?: string;
}

export class UpdateSpecialtiesDto {
  @ApiProperty({ example: ['Anxiety', 'Depression', 'Couples Therapy'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  specialties!: string[];
}

export class AddCertificateDto {
  @ApiProperty({ example: 'Cognitive Behavioral Therapy Certification' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Université de Tunis' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  issuer!: string;

  @ApiPropertyOptional({ example: '2020-06-01' })
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  @ApiPropertyOptional({ example: '2025-06-01' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class SetVacationModeDto {
  @ApiProperty()
  @IsBoolean()
  vacationMode!: boolean;

  @ApiPropertyOptional({ example: '2024-09-01', description: 'Vacation end date' })
  @IsOptional()
  @IsDateString()
  vacationUntil?: string;
}

export class AvailabilitySlotDto {
  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '09:00', description: 'HH:MM format' })
  @IsString()
  @MinLength(5)
  @MaxLength(5)
  startTime!: string;

  @ApiProperty({ example: '17:00', description: 'HH:MM format' })
  @IsString()
  @MinLength(5)
  @MaxLength(5)
  endTime!: string;
}

export class UpdateAvailabilityDto {
  @ApiProperty({ type: [AvailabilitySlotDto] })
  @IsArray()
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}

export class CreateAvailabilityExceptionDto {
  @ApiProperty({ example: '2026-08-20' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ example: 'Conges annuels' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

export class UpdateCertificateStatusDto {
  @ApiProperty({ enum: ['VERIFIED', 'REJECTED'] })
  @IsString()
  @IsNotEmpty()
  status!: 'VERIFIED' | 'REJECTED';
}

export class PsychologistQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by specialty' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ enum: SessionFormat })
  @IsOptional()
  @IsEnum(SessionFormat)
  sessionFormat?: SessionFormat;

  @ApiPropertyOptional({ description: 'Filter by language code' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ example: 50, description: 'Max price per session' })
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'rating', enum: ['rating', 'price', 'experience', 'createdAt'] })
  @IsOptional()
  @IsString()
  sortBy?: string = 'rating';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  order?: 'asc' | 'desc' = 'desc';
}
