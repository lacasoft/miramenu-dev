import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/environment';
import {
  deliveryStateOf,
  outcomeOfFailedCall,
  outcomeOfResponse,
  twilioErrorCode,
} from './twilio-responses';
import { isTwilioSignatureValid } from './twilio-signature';
import {
  type DeliveryReport,
  type DeliveryState,
  type InboundReport,
  type SendOutcome,
  type VerificationMessage,
  VerificationSender,
} from './verification-sender';

/** The query parameter of the status callback that carries our id of the send. */
export const REFERENCE_PARAMETER = 'sendId';
const SIGNATURE_HEADER = 'x-twilio-signature';

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

/** Form fields must all be plain strings, as Twilio sends them. */
const formFields = (body: unknown): Record<string, string> | null => {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return null;
  const entries = Object.entries(body);
  return entries.every(([, value]) => typeof value === 'string')
    ? (Object.fromEntries(entries) as Record<string, string>)
    : null;
};

/**
 * Twilio's Messages API, for WhatsApp and SMS alike (ADR-0039). The text is the Content
 * template's, with the code as its variable 1, so no diner-facing text lives in code.
 * Plain fetch, no SDK: nothing to install for a few form posts.
 */
@Injectable()
export class TwilioVerificationSender extends VerificationSender {
  private readonly logger = new Logger(TwilioVerificationSender.name);
  private readonly twilio: AppConfig['verification']['twilio'];
  private readonly channel: AppConfig['verification']['channel'];
  private readonly timeoutMs: number;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super();
    this.twilio = config.verification.twilio;
    this.channel = config.verification.channel;
    this.timeoutMs = config.verification.providerTimeoutMs;
  }

  async send(message: VerificationMessage): Promise<SendOutcome> {
    const form = new URLSearchParams({
      To: this.address(message.to),
      ContentSid: this.twilio.contentSid,
      ContentVariables: JSON.stringify({ '1': message.code }),
      StatusCallback: `${this.twilio.statusCallbackUrl}?${new URLSearchParams({
        [REFERENCE_PARAMETER]: message.reference,
      }).toString()}`,
    });
    if (this.twilio.from.startsWith('MG')) {
      form.set('MessagingServiceSid', this.twilio.from);
    } else {
      form.set('From', this.address(this.twilio.from));
    }
    let response: Response;
    try {
      response = await fetch(this.accountUrl('/Messages.json'), {
        method: 'POST',
        headers: {
          Authorization: this.authorization(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const outcome = outcomeOfFailedCall(error);
      this.logger.warn(
        outcome.kind === 'unknown'
          ? `No answer from Twilio within ${this.timeoutMs} ms; the send is unconfirmed`
          : 'Twilio could not be reached; the code was not sent',
      );
      return outcome;
    }
    const body = await readJson(response);
    const outcome = outcomeOfResponse(response.status, body);
    if (outcome.kind === 'unavailable') {
      this.logger.warn(
        `Twilio refused the send: HTTP ${response.status}, code ${twilioErrorCode(body) ?? 'none'}`,
      );
    }
    return outcome;
  }

  async deliveryState(
    providerMessageId: string,
  ): Promise<DeliveryState | null> {
    try {
      const response = await fetch(
        this.accountUrl(
          `/Messages/${encodeURIComponent(providerMessageId)}.json`,
        ),
        {
          headers: { Authorization: this.authorization() },
          signal: AbortSignal.timeout(this.timeoutMs),
        },
      );
      if (!response.ok) return null;
      const body = await readJson(response);
      return typeof body === 'object' && body !== null && 'status' in body
        ? deliveryStateOf(body.status)
        : null;
    } catch {
      return null;
    }
  }

  readReport(report: InboundReport): DeliveryReport | null {
    const params = formFields(report.body);
    const signature = report.headers[SIGNATURE_HEADER];
    // Checked against the URL Twilio was given, never the Host the request claims.
    const url = `${this.twilio.statusCallbackUrl}${report.query}`;
    if (
      params === null ||
      typeof signature !== 'string' ||
      !isTwilioSignatureValid(this.twilio.authToken, url, params, signature)
    ) {
      return null;
    }
    const reference = new URLSearchParams(report.query).get(
      REFERENCE_PARAMETER,
    );
    const state = deliveryStateOf(params.MessageStatus);
    const providerMessageId = params.MessageSid;
    if (!reference || state === null || !providerMessageId) return null;
    return { reference, providerMessageId, state };
  }

  async verify(): Promise<void> {
    const response = await fetch(this.accountUrl('.json'), {
      headers: { Authorization: this.authorization() },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok)
      throw new Error(`Twilio answered HTTP ${response.status}`);
  }

  private address(phone: string): string {
    return this.channel === 'whatsapp' ? `whatsapp:${phone}` : phone;
  }

  private accountUrl(path: string): string {
    return `${this.twilio.apiBaseUrl}/2010-04-01/Accounts/${this.twilio.accountSid}${path}`;
  }

  private authorization(): string {
    const credentials = `${this.twilio.accountSid}:${this.twilio.authToken}`;
    return `Basic ${Buffer.from(credentials).toString('base64')}`;
  }
}
