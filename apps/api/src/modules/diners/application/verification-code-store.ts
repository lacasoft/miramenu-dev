import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CACHE } from '../../../infrastructure/redis/redis.module';
import type { SendState } from '../domain/send-policy';
import type { LiveCode } from '../domain/verification-code';
import { registrationUnavailable } from './errors';

const codeKey = (phoneKey: string) => `diners:code:${phoneKey}`;
const lockKey = (phoneKey: string) => `diners:code-lock:${phoneKey}`;
const sendKey = (sendId: string) => `diners:send:${sendId}`;

/** A send's record outlives its code, so late delivery reports still find it. */
const SEND_RECORD_TTL_SECONDS = 24 * 60 * 60;

export interface CodeState {
  codes: LiveCode[];
  /** The latest send, whose state decides whether the diner must wait for another. */
  sendId: string;
  sentAtMs: number;
}

export interface SendRecord {
  state: SendState;
  providerMessageId: string | null;
}

export type ClaimResult = 'ok' | 'invalid' | 'expired';

/**
 * Counts the attempt and, if the hash is one of the live codes, deletes them all: a
 * code works once. The last allowed attempt, or no live code left, also deletes them.
 * In one script, so two requests can never both use the same code or the same attempt.
 */
const CLAIM_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then return 'expired' end
local attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
local raw = redis.call('HGET', KEYS[1], 'codes')
local now = tonumber(ARGV[2])
local live = false
if raw then
  for _, code in ipairs(cjson.decode(raw)) do
    if code.expiresAtMs > now then
      live = true
      if code.hash == ARGV[1] then
        redis.call('DEL', KEYS[1])
        return 'ok'
      end
    end
  end
end
if (not live) or attempts >= tonumber(ARGV[3]) then
  redis.call('DEL', KEYS[1])
  return 'expired'
end
return 'invalid'
`;

/** Releases the lock only if it is still the caller's, never one taken after it expired. */
const UNLOCK_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0
`;

/**
 * Codes and sends in Redis (design: "CódigoValidación vive en Redis"), through the
 * fail-fast client. It fails closed: if Redis does not answer, registration is closed,
 * because codes and their limits cannot be checked (design: "Cae Redis").
 */
@Injectable()
export class VerificationCodeStore {
  private readonly logger = new Logger(VerificationCodeStore.name);

  constructor(@Inject(REDIS_CACHE) private readonly redis: Redis) {}

  /** One request for a code per phone at a time; null if another one holds it. */
  async lock(phoneKey: string, ttlMs: number): Promise<string | null> {
    const token = randomBytes(16).toString('base64url');
    const result = await this.withRedis(() =>
      this.redis.set(lockKey(phoneKey), token, 'PX', ttlMs, 'NX'),
    );
    return result === 'OK' ? token : null;
  }

  /** If this fails the lock still expires on its own, so the failure is only logged. */
  async unlock(phoneKey: string, token: string): Promise<void> {
    try {
      await this.redis.eval(UNLOCK_SCRIPT, 1, lockKey(phoneKey), token);
    } catch (error) {
      this.logger.warn(
        `Could not release a code lock: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async current(phoneKey: string): Promise<CodeState | null> {
    const state = await this.withRedis(() =>
      this.redis.hgetall(codeKey(phoneKey)),
    );
    if (!state.codes || !state.sendId || !state.sentAt) return null;
    return {
      codes: JSON.parse(state.codes) as LiveCode[],
      sendId: state.sendId,
      sentAtMs: Number(state.sentAt),
    };
  }

  /** Replaces the phone's codes; a new code starts with its attempts at zero. */
  async save(phoneKey: string, state: CodeState, ttlMs: number): Promise<void> {
    const key = codeKey(phoneKey);
    await this.exec(
      this.redis
        .multi()
        .del(key)
        .hset(key, {
          codes: JSON.stringify(state.codes),
          attempts: 0,
          sendId: state.sendId,
          sentAt: state.sentAtMs,
        })
        .pexpire(key, ttlMs),
    );
  }

  async claim(
    phoneKey: string,
    hash: string,
    nowMs: number,
    maxAttempts: number,
  ): Promise<ClaimResult> {
    const result = await this.withRedis(() =>
      this.redis.eval(
        CLAIM_SCRIPT,
        1,
        codeKey(phoneKey),
        hash,
        String(nowMs),
        String(maxAttempts),
      ),
    );
    if (result === 'ok' || result === 'invalid' || result === 'expired')
      return result;
    throw registrationUnavailable();
  }

  async send(sendId: string): Promise<SendRecord | null> {
    const record = await this.withRedis(() =>
      this.redis.hgetall(sendKey(sendId)),
    );
    if (!record.state) return null;
    return {
      state: record.state as SendState,
      providerMessageId: record.providerMessageId || null,
    };
  }

  async writeSend(sendId: string, record: SendRecord): Promise<void> {
    const key = sendKey(sendId);
    await this.exec(
      this.redis
        .multi()
        .hset(key, {
          state: record.state,
          providerMessageId: record.providerMessageId ?? '',
        })
        .expire(key, SEND_RECORD_TTL_SECONDS),
    );
  }

  private async exec(transaction: ReturnType<Redis['multi']>): Promise<void> {
    const results = await this.withRedis(() => transaction.exec());
    if (!results || results.some(([error]) => error !== null))
      throw registrationUnavailable();
  }

  private async withRedis<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      throw registrationUnavailable();
    }
  }
}
