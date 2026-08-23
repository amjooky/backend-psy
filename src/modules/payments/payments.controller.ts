import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { InvoiceService } from './invoice.service';
import { InitiatePaymentDto, VerifyPaymentDto, RequestRefundDto } from './dto/payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly invoiceService: InvoiceService,
  ) {}

  @Post('initiate')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Initiate a payment for an appointment session' })
  async initiate(@CurrentUser('sub') userId: string, @Body() dto: InitiatePaymentDto) {
    return this.paymentsService.initiate(userId, dto);
  }

  @Post('verify')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'Verify payment from checkout provider redirect' })
  async verify(@Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verify(dto);
  }

  @Post('refund')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.PATIENT)
  @ApiOperation({ summary: 'Refund a completed payment session' })
  async refund(@CurrentUser() user: JwtPayload, @Body() dto: RequestRefundDto) {
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    return this.paymentsService.refund(user.sub, isAdmin, dto);
  }

  @Get('invoices')
  @Roles(UserRole.PATIENT)
  @ApiOperation({ summary: 'List patient invoice histories' })
  async getInvoices(@CurrentUser('sub') userId: string) {
    return this.paymentsService.getInvoices(userId);
  }

  @Get('invoices/:id/pdf')
  @Roles(UserRole.PATIENT, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate or get invoice PDF' })
  async getInvoicePdf(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) invoiceId: string,
  ) {
    return { url: await this.invoiceService.getOrGenerateInvoicePdf(invoiceId, user.sub, user.role) };
  }

  @Get('admin/all-invoices')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all invoices for admin moderation and export' })
  async getAllInvoices() {
    return this.paymentsService.getAllInvoices();
  }

  @Post('invoices/:id/regenerate-pdf')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Regenerate invoice PDF (admin only)' })
  async regenerateInvoicePdf(@Param('id', ParseUUIDPipe) invoiceId: string) {
    return { url: await this.invoiceService.regenerateInvoicePdf(invoiceId) };
  }
}
