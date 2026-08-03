import { Injectable, BadRequestException } from '@nestjs/common';
import { PaymentProvider } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import axios from 'axios';

export interface PaymentInitiateResult {
  providerRef: string;
  paymentUrl: string;
  metadata?: Record<string, any>;
}

export interface PaymentVerifyResult {
  success: boolean;
  amount: number;
  currency: string;
  providerRef: string;
  providerMetadata?: Record<string, any>;
  failureReason?: string;
}

export interface RefundResult {
  success: boolean;
  providerRef: string;
}

export interface PaymentStrategy {
  initiatePayment(amount: number, currency: string, appointmentId: string, metadata?: Record<string, any>): Promise<PaymentInitiateResult>;
  verifyPayment(providerRef: string, payload?: any): Promise<PaymentVerifyResult>;
  refundPayment(providerRef: string, amount: number, currency: string): Promise<RefundResult>;
}

@Injectable()
export class StripeStrategy implements PaymentStrategy {
  private stripe: Stripe;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('payments.stripe.secretKey') || 'sk_test_mock';
    this.stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any });
  }

  async initiatePayment(amount: number, currency: string, appointmentId: string, metadata?: Record<string, any>): Promise<PaymentInitiateResult> {
    try {
      // Amount in cents for Stripe
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              product_data: {
                name: `Psychotherapy Session #${appointmentId}`,
              },
              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${this.config.get('app.frontendUrl')}/appointments/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${this.config.get('app.frontendUrl')}/appointments/cancel`,
        metadata: {
          appointmentId,
          ...metadata,
        },
      });

      return {
        providerRef: session.id,
        paymentUrl: session.url || '',
      };
    } catch (err: any) {
      throw new BadRequestException(`Stripe initiation failed: ${err.message}`);
    }
  }

  async verifyPayment(providerRef: string): Promise<PaymentVerifyResult> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(providerRef);
      if (session.payment_status === 'paid') {
        return {
          success: true,
          amount: (session.amount_total || 0) / 100,
          currency: (session.currency || 'TND').toUpperCase(),
          providerRef: session.id,
          providerMetadata: session as any,
        };
      }
      return {
        success: false,
        amount: (session.amount_total || 0) / 100,
        currency: (session.currency || 'TND').toUpperCase(),
        providerRef: session.id,
        failureReason: 'Payment not completed.',
      };
    } catch (err: any) {
      return {
        success: false,
        amount: 0,
        currency: 'TND',
        providerRef,
        failureReason: err.message,
      };
    }
  }

  async refundPayment(providerRef: string, amount: number, currency: string): Promise<RefundResult> {
    try {
      // Need PaymentIntent ID from Checkout Session
      const session = await this.stripe.checkout.sessions.retrieve(providerRef);
      const paymentIntentId = session.payment_intent as string;
      if (!paymentIntentId) {
        throw new Error('PaymentIntent not found for this checkout session.');
      }
      const refund = await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100),
      });
      return {
        success: refund.status === 'succeeded' || refund.status === 'pending',
        providerRef: refund.id,
      };
    } catch {
      return { success: false, providerRef: '' };
    }
  }
}

@Injectable()
export class PaymeeStrategy implements PaymentStrategy {
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('payments.paymee.apiKey') || 'mock-key';
    this.apiUrl = this.config.get<string>('payments.paymee.apiUrl') || 'https://app.paymee.tn/api/v2';
  }

  async initiatePayment(amount: number, currency: string, appointmentId: string): Promise<PaymentInitiateResult> {
    try {
      const response = await axios.post(
        `${this.apiUrl}/payments/create`,
        {
          amount,
          note: `Session #${appointmentId}`,
          first_name: 'Monpsy',
          last_name: 'Patient',
          email: 'patient@monpsy.tn',
          phone: '00000000',
          return_url: `${this.config.get('app.frontendUrl')}/appointments/paymee-callback`,
          cancel_url: `${this.config.get('app.frontendUrl')}/appointments/cancel`,
        },
        {
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (response.data && response.data.status) {
        return {
          providerRef: String(response.data.data.payment_id),
          paymentUrl: response.data.data.payment_url,
        };
      }
      throw new Error(response.data.message || 'Paymee setup failed');
    } catch (err: any) {
      throw new BadRequestException(`Paymee initiation failed: ${err.message}`);
    }
  }

  async verifyPayment(providerRef: string): Promise<PaymentVerifyResult> {
    try {
      const response = await axios.get(`${this.apiUrl}/payments/${providerRef}/check`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });

      if (response.data && response.data.status && response.data.data.payment_status === 'success') {
        return {
          success: true,
          amount: response.data.data.amount,
          currency: 'TND',
          providerRef,
          providerMetadata: response.data.data,
        };
      }
      return {
        success: false,
        amount: response.data?.data?.amount || 0,
        currency: 'TND',
        providerRef,
        failureReason: response.data?.message || 'Verification unsuccessful.',
      };
    } catch (err: any) {
      return {
        success: false,
        amount: 0,
        currency: 'TND',
        providerRef,
        failureReason: err.message,
      };
    }
  }

  async refundPayment(): Promise<RefundResult> {
    // Paymee API typically handles refunds manually or through a different dashboard. Return mock fail/success.
    return { success: false, providerRef: 'PAYMEE_MANUAL_REFUND_REQUIRED' };
  }
}

/**
 * MockStrategy — instantly simulates a completed payment for local dev / demo.
 * No external API calls are made. The backend marks the appointment CONFIRMED immediately.
 */
@Injectable()
export class MockStrategy implements PaymentStrategy {
  constructor(private readonly config: ConfigService) {}

  async initiatePayment(_amount: number, _currency: string, appointmentId: string): Promise<PaymentInitiateResult> {
    const frontendUrl = this.config.get<string>('app.frontendUrl') || 'http://localhost:3002';
    return {
      providerRef: `mock-${appointmentId}-${Date.now()}`,
      paymentUrl: `${frontendUrl}/dashboard/patient/appointments?paid=true`,
    };
  }

  async verifyPayment(providerRef: string): Promise<PaymentVerifyResult> {
    return {
      success: true,
      amount: 0,
      currency: 'TND',
      providerRef,
      providerMetadata: { mock: true },
    };
  }

  async refundPayment(providerRef: string): Promise<RefundResult> {
    return { success: true, providerRef: `mock-refund-${providerRef}` };
  }
}
