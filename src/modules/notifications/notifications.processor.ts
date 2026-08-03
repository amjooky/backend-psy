import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES } from '../../common/constants/app.constants';
import { EmailJobData, PushJobData, NotificationsService } from './notifications.service';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Processor(QUEUE_NAMES.EMAIL)
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private transporter!: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('smtp.host') || 'localhost',
      port: this.config.get<number>('smtp.port') || 1025,
      secure: this.config.get<boolean>('smtp.secure') || false,
      auth: {
        user: this.config.get<string>('smtp.user') || '',
        pass: this.config.get<string>('smtp.pass') || '',
      },
    });
  }

  @Process('send')
  async handleSendEmail(job: Job<EmailJobData>) {
    const { to, subject, template, context } = job.data;
    this.logger.log(`Processing email job ${job.id} for ${to}`);

    // Simulation of template compiled layout (Production handles compile handlebars)
    const bodyContent = `
      <h1>Monpsy Notification</h1>
      <p>Template: ${template}</p>
      <pre>${JSON.stringify(context, null, 2)}</pre>
    `;

    try {
      await this.transporter.sendMail({
        from: `"${this.config.get('smtp.fromName')}" <${this.config.get('smtp.fromEmail')}>`,
        to,
        subject,
        html: bodyContent,
      });
      this.logger.log(`Email sent successfully to ${to}`);
    } catch (err: any) {
      this.logger.error(`Failed to send email to ${to}: ${err.message}`);
      throw err;
    }
  }
}

@Processor(QUEUE_NAMES.NOTIFICATIONS)
export class PushProcessor {
  private readonly logger = new Logger(PushProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Process('push')
  async handleSendPush(job: Job<PushJobData>) {
    const { token, title, body, data } = job.data;
    this.logger.log(`Processing push notification job ${job.id}`);
    // Delegates to NotificationsService which uses firebase-admin (or stubs if no creds)
    await this.notificationsService.sendFcmPush(token, title, body, data);
  }
}
