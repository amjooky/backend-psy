import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentFactory } from './payment.factory';
import { StripeStrategy, PaymeeStrategy, MockStrategy } from './strategies/payment.strategy';

@Module({
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentFactory,
    StripeStrategy,
    PaymeeStrategy,
    MockStrategy,
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
