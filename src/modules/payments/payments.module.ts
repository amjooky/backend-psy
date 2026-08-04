import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentFactory } from './payment.factory';
import { StripeStrategy, PaymeeStrategy, MockStrategy } from './strategies/payment.strategy';
import { InvoiceService } from './invoice.service';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [DocumentsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentFactory,
    StripeStrategy,
    PaymeeStrategy,
    MockStrategy,
    InvoiceService,
  ],
  exports: [PaymentsService, InvoiceService],
})
export class PaymentsModule {}
