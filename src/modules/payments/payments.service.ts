import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PaymentFactory } from './payment.factory';
import { InitiatePaymentDto, VerifyPaymentDto, RequestRefundDto } from './dto/payment.dto';
import { AppointmentStatus, PaymentStatus, RefundStatus, Prisma } from '@prisma/client';
import { InvoiceService } from './invoice.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentFactory: PaymentFactory,
    private readonly invoiceService: InvoiceService,
  ) {}

  async initiate(userId: string, dto: InitiatePaymentDto) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { id: dto.appointmentId },
      include: { patient: true },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
    }

    if (appointment.patient.userId !== userId) {
      throw new BadRequestException('You do not own this appointment booking.');
    }

    if (appointment.status === AppointmentStatus.CANCELLED || appointment.status === AppointmentStatus.COMPLETED) {
      throw new BadRequestException('Cannot pay for cancelled or completed appointments.');
    }

    // Check existing payment
    const existingPayment = await this.prisma.payment.findUnique({
      where: { appointmentId: appointment.id },
    });

    if (existingPayment && existingPayment.status === PaymentStatus.COMPLETED) {
      throw new ConflictException('This appointment has already been paid.');
    }

    const amount = Number(appointment.price);
    const strategy = this.paymentFactory.getStrategy(dto.provider);

    const initResult = await strategy.initiatePayment(amount, appointment.currency, appointment.id);

    // ── MOCK: instantly complete (no real checkout needed) ──────────────
    if (dto.provider === 'MOCK' as any) {
      await this.prisma.$transaction(async (tx) => {
        const payment = existingPayment
          ? await tx.payment.update({
              where: { id: existingPayment.id },
              data: {
                provider: dto.provider,
                providerRef: initResult.providerRef,
                status: PaymentStatus.COMPLETED,
                paidAt: new Date(),
              },
            })
          : await tx.payment.create({
              data: {
                appointment: { connect: { id: appointment.id } },
                patient: { connect: { id: appointment.patientId } },
                provider: dto.provider,
                amount: new Prisma.Decimal(amount),
                currency: appointment.currency,
                status: PaymentStatus.COMPLETED,
                providerRef: initResult.providerRef,
                paidAt: new Date(),
              },
            });

        // Confirm the appointment
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { status: AppointmentStatus.CONFIRMED },
        });

        // Auto-generate invoice
        const count = await tx.invoice.count();
        const invoiceNum = `INV-${new Date().getFullYear()}-${1000 + count + 1}`;
        const invoice = await tx.invoice.create({
          data: {
            payment: { connect: { id: payment.id } },
            patient: { connect: { id: appointment.patientId } },
            appointment: { connect: { id: appointment.id } },
            invoiceNumber: invoiceNum,
            subtotal: new Prisma.Decimal(amount),
            total: new Prisma.Decimal(amount),
            currency: appointment.currency,
          },
        });

        // Generate PDF invoice (async, non-blocking)
        this.invoiceService.generateInvoicePdf(invoice.id).catch((error) => {
          this.logger.error(`Failed to generate invoice PDF: ${error.message}`);
        });
      });

      return {
        paymentId: null,
        paymentUrl: initResult.paymentUrl,
        providerRef: initResult.providerRef,
        mock: true,
      };
    }
    // ────────────────────────────────────────────────────────────────────

    let payment;
    if (existingPayment) {
      payment = await this.prisma.payment.update({
        where: { id: existingPayment.id },
        data: {
          provider: dto.provider,
          providerRef: initResult.providerRef,
          status: PaymentStatus.PENDING,
        },
      });
    } else {
      payment = await this.prisma.payment.create({
        data: {
          appointment: { connect: { id: appointment.id } },
          patient: { connect: { id: appointment.patientId } },
          provider: dto.provider,
          amount: new Prisma.Decimal(amount),
          currency: appointment.currency,
          status: PaymentStatus.PENDING,
          providerRef: initResult.providerRef,
        },
      });
    }

    return {
      paymentId: payment.id,
      paymentUrl: initResult.paymentUrl,
      providerRef: initResult.providerRef,
    };
  }

  async verify(dto: VerifyPaymentDto) {
    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: dto.providerRef, provider: dto.provider },
      include: { appointment: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment transaction not found.');
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      return { success: true, message: 'Payment already verified.' };
    }

    const strategy = this.paymentFactory.getStrategy(dto.provider);
    const verification = await strategy.verifyPayment(dto.providerRef);

    if (verification.success) {
      await this.prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.COMPLETED,
            paidAt: new Date(),
            providerMetadata: verification.providerMetadata as Prisma.InputJsonValue,
          },
        });

        // Set appointment status to confirmed upon successful payment
        await tx.appointment.update({
          where: { id: payment.appointmentId },
          data: { status: AppointmentStatus.CONFIRMED },
        });

        // Auto-generate invoice
        const count = await tx.invoice.count();
        const invoiceNum = `INV-${new Date().getFullYear()}-${1000 + count + 1}`;
        const invoice = await tx.invoice.create({
          data: {
            payment: { connect: { id: payment.id } },
            patient: { connect: { id: payment.patientId } },
            appointment: { connect: { id: payment.appointmentId } },
            invoiceNumber: invoiceNum,
            subtotal: payment.amount,
            total: payment.amount,
            currency: payment.currency,
          },
        });

        // Generate PDF invoice (async, non-blocking)
        this.invoiceService.generateInvoicePdf(invoice.id).catch((error) => {
          this.logger.error(`Failed to generate invoice PDF: ${error.message}`);
        });
      });

      return { success: true, message: 'Payment verified and invoice generated.' };
    } else {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: verification.failureReason,
        },
      });
      return { success: false, message: verification.failureReason };
    }
  }

  async refund(userId: string, isAdmin: boolean, dto: RequestRefundDto) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: { appointment: true },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found.');
    }

    if (payment.status !== PaymentStatus.COMPLETED) {
      throw new BadRequestException('Only completed payments can be refunded.');
    }

    // Authorization check
    if (!isAdmin) {
      const patient = await this.prisma.patient.findUnique({ where: { id: payment.patientId } });
      if (!patient || patient.userId !== userId) {
        throw new ForbiddenException('Access denied.');
      }
    }

    const refundAmount = Number(dto.amount);
    if (refundAmount > Number(payment.amount)) {
      throw new BadRequestException('Refund amount cannot exceed payment amount.');
    }

    const strategy = this.paymentFactory.getStrategy(payment.provider);
    const refundResult = await strategy.refundPayment(payment.providerRef || '', refundAmount, payment.currency);

    if (refundResult.success) {
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.create({
          data: {
            payment: { connect: { id: payment.id } },
            amount: new Prisma.Decimal(refundAmount),
            reason: dto.reason,
            status: RefundStatus.COMPLETED,
            providerRef: refundResult.providerRef,
            processedAt: new Date(),
            processedBy: userId,
          },
        });

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.REFUNDED },
        });

        await tx.appointment.update({
          where: { id: payment.appointmentId },
          data: { status: AppointmentStatus.CANCELLED },
        });
      });

      return { success: true, message: 'Refund processed successfully.' };
    } else {
      throw new BadRequestException('Provider refund processing failed.');
    }
  }

  async getInvoices(userId: string) {
    return this.prisma.invoice.findMany({
      where: { patient: { userId } },
      include: {
        appointment: {
          include: {
            psychologist: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        payment: true,
      },
      orderBy: { issuedAt: 'desc' },
    });
  }

  async getAllInvoices() {
    return this.prisma.invoice.findMany({
      include: {
        payment: true,
        patient: {
          select: {
            firstName: true,
            lastName: true,
            anonymousName: true,
            isAnonymous: true,
          },
        },
        appointment: {
          include: {
            psychologist: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { issuedAt: 'desc' },
    });
  }
}
