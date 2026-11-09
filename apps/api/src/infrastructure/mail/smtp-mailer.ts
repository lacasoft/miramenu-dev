import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import { Mailer, type MailMessage } from './mailer';

const SMTP_TIMEOUT_MS = 10_000;

/** SMTP adapter: Mailpit in development and CI (ADR-0030), the chosen provider in production. */
@Injectable()
export class SmtpMailer extends Mailer implements OnApplicationShutdown {
  private readonly transport: ReturnType<typeof createTransport>;
  private readonly from: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    const mail = config.mail;
    this.from = mail.from;
    this.transport = createTransport({
      host: mail.host,
      port: mail.port,
      secure: mail.secure,
      auth: mail.auth
        ? { user: mail.auth.user, pass: mail.auth.password }
        : undefined,
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...message });
  }

  async verify(): Promise<void> {
    await this.transport.verify();
  }

  onApplicationShutdown(): void {
    this.transport.close();
  }
}
