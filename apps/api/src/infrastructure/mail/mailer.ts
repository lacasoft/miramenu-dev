export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Port for outgoing email, used for admin invitations (ADR-0023). The production provider
 * is not chosen yet; SMTP is the interface every candidate offers.
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
  /** Throws if the mail server cannot be reached or rejects the credentials. */
  abstract verify(): Promise<void>;
}
