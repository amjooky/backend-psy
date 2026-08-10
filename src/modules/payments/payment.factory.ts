import { Injectable, BadRequestException } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { StripeStrategy, PaymeeStrategy, MockStrategy, PaymentStrategy } from './strategies/payment.strategy';

@Injectable()
export class PaymentFactory {
  constructor(
    private readonly stripeStrategy: StripeStrategy,
    private readonly paymeeStrategy: PaymeeStrategy,
    private readonly mockStrategy: MockStrategy,
  ) {}

  getStrategy(provider: PaymentProvider): PaymentStrategy {
    switch (provider) {
      case PaymentProvider.STRIPE:
        return this.stripeStrategy;
      case PaymentProvider.PAYMEE:
        return this.paymeeStrategy;
      case (PaymentProvider as any).MOCK:
        return this.mockStrategy;
      default:
        throw new BadRequestException(`Payment provider ${provider} is not supported yet.`);
    }
  }
}
