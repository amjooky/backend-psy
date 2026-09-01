import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { DocumentsService } from '../documents/documents.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';

import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentsService: DocumentsService,
    private readonly config: ConfigService,
  ) {}

  async getOrGenerateInvoicePdf(invoiceId: string, userId?: string, userRole?: UserRole): Promise<string> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { patient: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found.');
    }

    if (userRole === UserRole.PATIENT && userId && invoice.patient.userId !== userId) {
      throw new ForbiddenException('Access denied.');
    }

    if (invoice.pdfUrl) {
      const serverPort = this.config.get<number>('PORT') || 3000;
      const baseUrl =
        process.env.RENDER_EXTERNAL_URL ||
        process.env.APP_URL ||
        (process.env.NODE_ENV === 'production'
          ? 'https://backend-psy-upv7.onrender.com'
          : `http://localhost:${serverPort}`);

      let effectiveUrl = invoice.pdfUrl;
      if (effectiveUrl.includes('localhost:') && !effectiveUrl.includes('localhost:9000')) {
        effectiveUrl = effectiveUrl.replace(/http:\/\/localhost:\d+/, baseUrl);
      }

      // Check if local file exists on disk (Render container restart safety)
      if (effectiveUrl.includes('/uploads/')) {
        const relativePart = effectiveUrl.split('/uploads/')[1];
        if (relativePart) {
          const localPath = path.join(process.cwd(), 'uploads', relativePart);
          if (!fs.existsSync(localPath)) {
            this.logger.warn(`Invoice PDF missing on disk at ${localPath}, regenerating on the fly...`);
            return this.generateInvoicePdf(invoiceId);
          }
        }
      }

      return effectiveUrl;
    }

    return this.generateInvoicePdf(invoiceId);
  }

  async generateInvoicePdf(invoiceId: string): Promise<string> {
    try {
      // Fetch invoice with all related data
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          payment: {
            include: {
              appointment: {
                include: {
                  patient: {
                    include: {
                      user: true,
                    },
                  },
                  psychologist: {
                    include: {
                      user: true,
                    },
                  },
                },
              },
            },
          },
          patient: {
            include: {
              user: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([600, 800]);
      const { width, height } = page.getSize();

      // Embed fonts
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Company information
      const companyName = this.config.get<string>('COMPANY_NAME') || 'Monpsy';
      const companyAddress = this.config.get<string>('COMPANY_ADDRESS') || 'Tunisia';
      const companyEmail = this.config.get<string>('COMPANY_EMAIL') || 'contact@monpsy.tn';
      const companyPhone = this.config.get<string>('COMPANY_PHONE') || '+216 XX XXX XXX';

      // Header
      page.drawText(companyName, {
        x: 50,
        y: height - 50,
        size: 24,
        font: fontBold,
        color: rgb(0.2, 0.4, 0.8),
      });

      page.drawText('INVOICE', {
        x: width - 100,
        y: height - 50,
        size: 20,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Invoice details
      page.drawText(`Invoice Number: ${invoice.invoiceNumber}`, {
        x: 50,
        y: height - 100,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(`Date: ${invoice.issuedAt.toLocaleDateString()}`, {
        x: 50,
        y: height - 120,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
      });

      if (invoice.dueAt) {
        page.drawText(`Due Date: ${invoice.dueAt.toLocaleDateString()}`, {
          x: 50,
          y: height - 140,
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });
      }

      // Company address
      page.drawText('From:', {
        x: 50,
        y: height - 180,
        size: 14,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(companyName, {
        x: 50,
        y: height - 200,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(companyAddress, {
        x: 50,
        y: height - 215,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(`Email: ${companyEmail}`, {
        x: 50,
        y: height - 230,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(`Phone: ${companyPhone}`, {
        x: 50,
        y: height - 245,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Patient information
      const patientName = `${invoice.patient.firstName} ${invoice.patient.lastName}`;
      const patientEmail = invoice.patient.user.email;

      page.drawText('Bill To:', {
        x: 300,
        y: height - 180,
        size: 14,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(patientName, {
        x: 300,
        y: height - 200,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(`Email: ${patientEmail}`, {
        x: 300,
        y: height - 215,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Psychologist information
      const psychologistName = `${invoice.payment.appointment.psychologist.firstName} ${invoice.payment.appointment.psychologist.lastName}`;

      page.drawText('Psychologist:', {
        x: 300,
        y: height - 245,
        size: 14,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(psychologistName, {
        x: 300,
        y: height - 265,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Line separator
      page.drawLine({
        start: { x: 50, y: height - 290 },
        end: { x: width - 50, y: height - 290 },
        thickness: 2,
        color: rgb(0.2, 0.4, 0.8),
      });

      // Table header
      const tableTop = height - 320;
      page.drawText('Description', {
        x: 50,
        y: tableTop,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText('Date', {
        x: 250,
        y: tableTop,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText('Amount', {
        x: 450,
        y: tableTop,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Table content
      const appointmentDate = invoice.payment.appointment.startAt.toLocaleDateString();
      const sessionType = 'Psychology Consultation';
      const amount = `${Number(invoice.total).toFixed(2)} ${invoice.currency}`;

      page.drawText(sessionType, {
        x: 50,
        y: tableTop - 25,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(appointmentDate, {
        x: 250,
        y: tableTop - 25,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(amount, {
        x: 450,
        y: tableTop - 25,
        size: 11,
        font: font,
        color: rgb(0, 0, 0),
      });

      // Line separator
      page.drawLine({
        start: { x: 50, y: tableTop - 50 },
        end: { x: width - 50, y: tableTop - 50 },
        thickness: 1,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Totals
      const totalsY = tableTop - 80;
      page.drawText('Subtotal:', {
        x: 350,
        y: totalsY,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
      });

      page.drawText(`${Number(invoice.subtotal).toFixed(2)} ${invoice.currency}`, {
        x: 450,
        y: totalsY,
        size: 12,
        font: font,
        color: rgb(0, 0, 0),
      });

      if (Number(invoice.tax) > 0) {
        page.drawText('Tax:', {
          x: 350,
          y: totalsY - 20,
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });

        page.drawText(`${Number(invoice.tax).toFixed(2)} ${invoice.currency}`, {
          x: 450,
          y: totalsY - 20,
          size: 12,
          font: font,
          color: rgb(0, 0, 0),
        });
      }

      page.drawText('Total:', {
        x: 350,
        y: totalsY - 45,
        size: 14,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      page.drawText(`${Number(invoice.total).toFixed(2)} ${invoice.currency}`, {
        x: 450,
        y: totalsY - 45,
        size: 14,
        font: fontBold,
        color: rgb(0.2, 0.4, 0.8),
      });

      // Footer
      page.drawText('Thank you for your payment!', {
        x: 50,
        y: 100,
        size: 12,
        font: fontBold,
        color: rgb(0.2, 0.4, 0.8),
      });

      page.drawText('If you have any questions, please contact us at:', {
        x: 50,
        y: 80,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      page.drawText(companyEmail, {
        x: 50,
        y: 65,
        size: 10,
        font: font,
        color: rgb(0.5, 0.5, 0.5),
      });

      // Generate PDF bytes
      const pdfBytes = await pdfDoc.save();

      // Create file buffer
      const buffer = Buffer.from(pdfBytes);

      // Upload to MinIO
      const filename = `invoice-${invoice.invoiceNumber}.pdf`;
      const { url } = await this.documentsService.uploadFile(
        {
          buffer,
          originalname: filename,
          mimetype: 'application/pdf',
          size: buffer.length,
        },
        'invoices',
      );

      // Update invoice with PDF URL
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { pdfUrl: url },
      });

      this.logger.log(`Invoice PDF generated: ${filename}`);
      return url;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to generate invoice PDF: ${message}`);
      throw error;
    }
  }

  async regenerateInvoicePdf(invoiceId: string): Promise<string> {
    // Delete existing PDF if exists
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (invoice?.pdfUrl) {
      try {
        // Extract object name from URL and delete
        const urlParts = invoice.pdfUrl.split('/invoices/');
        if (urlParts.length > 1) {
          await this.documentsService.deleteFile(`invoices/${urlParts[1]}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn(`Failed to delete existing PDF: ${message}`);
      }
    }

    // Generate new PDF
    return this.generateInvoicePdf(invoiceId);
  }
}