import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  type InboundReport,
  type SendOutcome,
  VerificationSender,
} from '../../../infrastructure/verification/verification-sender';
import {
  isFinalSendState,
  nextSendState,
  type SendState,
} from '../domain/send-policy';
import { VerificationCodeStore } from './verification-code-store';

/** Our ids of sends are UUIDs; any other reference was never ours. */
const sendIdSchema = z.uuid();

const outcomeState: Record<SendOutcome['kind'], SendState> = {
  accepted: 'accepted',
  rejected: 'rejected',
  unavailable: 'unavailable',
  unknown: 'unknown',
};

/**
 * Where each send of a code stands, by our id of it (ADR-0039): what the call answered,
 * what the provider's signed reports said later, and what the provider says when asked.
 */
@Injectable()
export class SendTracking {
  constructor(
    private readonly store: VerificationCodeStore,
    private readonly sender: VerificationSender,
  ) {}

  /** Written before calling the provider, so a report that beats the answer finds it. */
  async open(sendId: string): Promise<void> {
    await this.store.writeSend(sendId, {
      state: 'sending',
      providerMessageId: null,
    });
  }

  /** The call's answer counts only if no report came first: a report knows more. */
  async recordOutcome(sendId: string, outcome: SendOutcome): Promise<void> {
    const record = await this.store.send(sendId);
    if (record !== null && record.state !== 'sending') return;
    await this.store.writeSend(sendId, {
      state: outcomeState[outcome.kind],
      providerMessageId:
        outcome.kind === 'accepted' ? outcome.providerMessageId : null,
    });
  }

  /**
   * The state of a send, asking the provider if it is not final yet and its message id
   * is known (design, step 2: "consulta el estado del envío por su id antes de reenviar").
   */
  async stateOf(sendId: string): Promise<SendState | null> {
    const record = await this.store.send(sendId);
    if (record === null) return null;
    if (isFinalSendState(record.state) || record.providerMessageId === null)
      return record.state;
    const reported = await this.sender.deliveryState(record.providerMessageId);
    if (reported === null) return record.state;
    const state = nextSendState(record.state, reported);
    if (state !== record.state)
      await this.store.writeSend(sendId, { ...record, state });
    return state;
  }

  /**
   * A delivery report from the provider. False if it is not genuinely the provider's;
   * a genuine report about a send we no longer know is taken and ignored.
   */
  async recordReport(inbound: InboundReport): Promise<boolean> {
    const report = this.sender.readReport(inbound);
    if (report === null) return false;
    if (!sendIdSchema.safeParse(report.reference).success) return true;
    const record = await this.store.send(report.reference);
    if (record === null) return true;
    await this.store.writeSend(report.reference, {
      state: nextSendState(record.state, report.state),
      providerMessageId: record.providerMessageId ?? report.providerMessageId,
    });
    return true;
  }
}
