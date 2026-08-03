import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: 'd0b6e159-86bd-4df7-9ad8-2b819f7e53f1', description: 'Associated completed appointment ID' })
  @IsUUID()
  @IsNotEmpty()
  appointmentId!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  @IsNotEmpty()
  rating!: number;

  @ApiPropertyOptional({ example: 'Very compassionate and helpful psychologist.' })
  @IsString()
  @IsOptional()
  comment?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  isAnonymous?: boolean = false;
}
