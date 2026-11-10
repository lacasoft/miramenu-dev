import type { IncomingHttpHeaders } from 'node:http';

export interface VerificationMessage {
  /** The diner's mobile in E.164. */
  to: string;
  code: string;
  /** Our id of this send: the provider's delivery reports carry it back (ADR-0039). */
  reference: string;
}

/**
 * What became of a send, as far as the API can tell when the call returns.
 * - accepted: the provider took it; its id may be missing if only the body was slow.
 * - rejected: the provider refuses this recipient (not a mobile, no WhatsApp…).
 * - unavailable: the provider failed or could not be reached; the message did not leave.
 * - unknown: no answer in time. It may have left, so it is never sent again blindly.
 */
export type SendOutcome =
  | { kind: 'accepted'; providerMessageId: string | null }
  | { kind: 'rejected' }
  | { kind: 'unavailable' }
  | { kind: 'unknown' };

/** Where a message stands, reduced to what registration needs. */
export type DeliveryState = 'accepted' | 'delivered' | 'failed';

export interface DeliveryReport {
  reference: string;
  providerMessageId: string;
  state: DeliveryState;
}

/** A delivery report as it reached the API, before its signature is checked. */
export interface InboundReport {
  /** The raw query string, with its leading "?", or "" if there is none. */
  query: string;
  body: unknown;
  headers: IncomingHttpHeaders;
}

/**
 * Port to the provider of verification codes (design: "Canal externo de códigos"). The
 * channel, WhatsApp or SMS, is configuration: the same for every business.
 */
export abstract class VerificationSender {
  abstract send(message: VerificationMessage): Promise<SendOutcome>;

  /** Asks the provider where a message stands; null if it cannot tell right now. */
  abstract deliveryState(
    providerMessageId: string,
  ): Promise<DeliveryState | null>;

  /** The report if it is genuinely the provider's (signed) and understood; null otherwise. */
  abstract readReport(report: InboundReport): DeliveryReport | null;

  /** Health check: the provider answers with these credentials, without sending anything. */
  abstract verify(): Promise<void>;
}
