import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsUUID, IsNumber, Min } from 'class-validator';
import { PaymentProvider } from '@prisma/client';

export class InitiatePaymentDto {
  @ApiProperty({ example: 'd0b6e159-86bd-4df7-9ad8-2b819f7e53f1' })
  @IsUUID()
  @IsNotEmpty()
  appointmentId!: string;

  @ApiProperty({ enum: PaymentProvider, default: PaymentProvider.STRIPE })
  @IsEnum(PaymentProvider)
  @IsNotEmpty()
  provider!: PaymentProvider;
}

export class VerifyPaymentDto {
  @ApiProperty({ example: 'cs_test_a1...' })
  @IsNotEmpty()
  providerRef!: string;

  @ApiProperty({ enum: PaymentProvider })
  @IsEnum(PaymentProvider)
  @IsNotEmpty()
  provider!: PaymentProvider;
}

export class RequestRefundDto {
  @ApiProperty({ example: 'd0b6e159-86bd-4df7-9ad8-2b819f7e53f1' })
  @IsUUID()
  @IsNotEmpty()
  paymentId!: string;

  @ApiProperty({ example: 80.00 })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  amount!: number;

  @ApiProperty({ example: 'Patient cancelled request in time.' })
  @IsNotEmpty()
  reason!: string;
}
