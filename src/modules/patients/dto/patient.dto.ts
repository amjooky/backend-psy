import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Gender } from '@prisma/client';

export class UpdatePatientProfileDto {
  @ApiPropertyOptional({ example: 'Amine' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Ben Ali' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '+21612345678' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'Africa/Tunis' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ example: 'fr' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  preferredLanguage?: string;

  @ApiPropertyOptional({ description: 'Anonymous display name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  anonymousName?: string;

  @ApiPropertyOptional({ description: 'Enable anonymous mode' })
  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @ApiPropertyOptional({ description: 'FCM push notification token' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fcmToken?: string;
}

export class UpdateMedicalQuestionnaireDto {
  @ApiProperty({
    description: 'Medical questionnaire answers as JSON',
    example: {
      mainConcern: 'Anxiety',
      previousTherapy: true,
      currentMedication: false,
      sleepIssues: true,
      preferredSessionType: 'video',
    },
  })
  @IsOptional()
  questionnaire?: Record<string, unknown>;
}

export class PatientQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: number = 20;
}
