import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { TicketPriority, TicketStatus } from '@prisma/client';

export class CreateTicketDto {
  @ApiProperty({ example: 'Billing issue' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ example: 'My last session payment was debited twice.' })
  @IsString()
  @IsNotEmpty()
  body!: string;

  @ApiProperty({ enum: TicketPriority, default: TicketPriority.MEDIUM })
  @IsEnum(TicketPriority)
  @IsOptional()
  priority?: TicketPriority = TicketPriority.MEDIUM;
}

export class ReplyTicketDto {
  @ApiProperty({ example: 'We have refunded the duplicate amount.' })
  @IsString()
  @IsNotEmpty()
  body!: string;
}

export class AssignTicketDto {
  @ApiProperty({ example: 'd0b6e159-86bd-4df7-9ad8-2b819f7e53f1' })
  @IsUUID()
  @IsNotEmpty()
  assigneeId!: string;
}

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus)
  @IsNotEmpty()
  status!: TicketStatus;
}
