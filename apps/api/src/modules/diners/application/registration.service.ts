import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CodeRequested, verifyCodeSchema } from '@miramenu/contracts';
import type { z } from 'zod';
import { APP_CONFIG } from '../../../infrastructure/config/config.module';
import type { AppConfig } from '../../../infrastructure/config/environment';
import { VerificationSender } from '../../../infrastructure/verification/verification-sender';
import { resendWaitSeconds } from '../domain/send-policy';
import {
  codeHashOf,
  generateVerificationCode,
  phoneKeyOf,
  withNewCode,
} from '../domain/verification-code';
import { DinerAccounts, type RegisteredDiner } from './diner-accounts';
import {
  codeExpired,
  codeInvalid,
  phoneNotReachable,
  privacyNoticeOutdated,
  providerUnavailable,
  tooManyRequests,
} from './errors';
import { RegistrationLimits } from './registration-limits';
import { SendTracking } from './send-tracking';
import {
  type CodeState,
  VerificationCodeStore,
} from './verification-code-store';

/** Margin over the provider's timeout for holding a phone's lock while its code is sent. */
const LOCK_MARGIN_MS = 5000;

export interface CodeRequest {
  phone: string;
  deviceId: string;
  ip: string;
  now: Date;
}

/**
 * Registration with a code (design: "Flujo: registro con código"): ask for a code, which
 * goes by the configured channel, and validate it to open the diner's account.
 */
@Injectable()
export class RegistrationService {
  private readonly settings: AppConfig['dinerRegistration'];
  private readonly lockMs: number;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly store: VerificationCodeStore,
    private readonly limits: RegistrationLimits,
    private readonly sends: SendTracking,
    private readonly sender: VerificationSender,
    private readonly accounts: DinerAccounts,
  ) {
    this.settings = config.dinerRegistration;
    this.lockMs = config.verification.providerTimeoutMs + LOCK_MARGIN_MS;
  }

  async requestCode(request: CodeRequest): Promise<CodeRequested> {
    const phoneKey = phoneKeyOf(this.settings.codeSecret, request.phone);
    const lock = await this.store.lock(phoneKey, this.lockMs);
    // Another request for this phone is sending its code right now.
    if (lock === null) throw tooManyRequests(Math.ceil(this.lockMs / 1000));
    try {
      const current = await this.store.current(phoneKey);
      await this.assertMayResend(current, request.now.getTime());
      await this.limits.consume({
        phoneKey,
        deviceId: request.deviceId,
        ip: request.ip,
      });
      return await this.send(phoneKey, current, request);
    } finally {
      await this.store.unlock(phoneKey, lock);
    }
  }

  async verify(
    input: z.output<typeof verifyCodeSchema>,
    deviceId: string,
    now: Date,
  ): Promise<RegisteredDiner> {
    // Checked first, so showing the current notice does not cost the diner an attempt.
    if (input.privacyNoticeVersion !== this.settings.privacyNoticeVersion)
      throw privacyNoticeOutdated();
    const phoneKey = phoneKeyOf(this.settings.codeSecret, input.phone);
    const claim = await this.store.claim(
      phoneKey,
      codeHashOf(this.settings.codeSecret, phoneKey, input.code),
      now.getTime(),
      this.settings.codeMaxAttempts,
    );
    if (claim === 'invalid') throw codeInvalid();
    if (claim === 'expired') throw codeExpired();
    return this.accounts.register({
      phone: input.phone,
      name: input.name,
      email: input.email,
      offersConsent: input.offersConsent,
      privacyNoticeVersion: input.privacyNoticeVersion,
      deviceId,
      now,
    });
  }

  /**
   * The diner waits 60 s between codes, unless the previous one is known to have failed.
   * Only then is the provider asked about it, by its id (design, step 2).
   */
  private async assertMayResend(
    current: CodeState | null,
    nowMs: number,
  ): Promise<void> {
    if (current === null) return;
    const previous = { sentAtMs: current.sentAtMs, state: null };
    if (resendWaitSeconds(previous, nowMs, this.settings.resendSeconds) === 0)
      return;
    const state = await this.sends.stateOf(current.sendId);
    const wait = resendWaitSeconds(
      { ...previous, state },
      nowMs,
      this.settings.resendSeconds,
    );
    if (wait > 0) throw tooManyRequests(wait);
  }

  private async send(
    phoneKey: string,
    current: CodeState | null,
    request: CodeRequest,
  ): Promise<CodeRequested> {
    const code = generateVerificationCode();
    const sendId = randomUUID();
    await this.sends.open(sendId);
    const outcome = await this.sender.send({
      to: request.phone,
      code,
      reference: sendId,
    });
    await this.sends.recordOutcome(sendId, outcome);
    if (outcome.kind === 'rejected') throw phoneNotReachable();
    if (outcome.kind === 'unavailable') throw providerUnavailable();

    // Accepted or unconfirmed: the code may reach the phone, so it becomes valid. An
    // unconfirmed send is never repeated on its own: it would cost twice.
    const nowMs = request.now.getTime();
    const expiresAtMs = nowMs + this.settings.codeTtlSeconds * 1000;
    const codes = withNewCode(
      current?.codes ?? [],
      {
        hash: codeHashOf(this.settings.codeSecret, phoneKey, code),
        expiresAtMs,
      },
      nowMs,
    );
    const lastExpiry = Math.max(...codes.map((live) => live.expiresAtMs));
    await this.store.save(
      phoneKey,
      { codes, sendId, sentAtMs: nowMs },
      lastExpiry - nowMs,
    );
    return {
      delivery: outcome.kind === 'accepted' ? 'sent' : 'unconfirmed',
      expiresAt: new Date(expiresAtMs).toISOString(),
      resendAfterSeconds: this.settings.resendSeconds,
    };
  }
}
