import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { MessageType } from '@prisma/client';

export class SendMessageDto {
  @ApiProperty({ example: 'd0b6e159-86bd-4df7-9ad8-2b819f7e53f1' })
  @IsUUID()
  @IsNotEmpty()
  conversationId!: string;

  @ApiPropertyOptional({ example: 'Hello Doctor.' })
  @IsString()
  @IsOptional()
  content?: string;

  @ApiProperty({ enum: MessageType, default: MessageType.TEXT })
  @IsEnum(MessageType)
  @IsNotEmpty()
  type!: MessageType;
}

export class CreateConversationDto {
  @ApiProperty({ example: 'd0b6e159-86bd-4df7-9ad8-2b819f7e53f1', description: 'Psychologist ID to chat with' })
  @IsUUID()
  @IsNotEmpty()
  psychologistId!: string;
}
