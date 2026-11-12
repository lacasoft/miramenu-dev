import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { phoneFromLocal } from "./phone.ts";
import {
  nextRegistration,
  REGISTRATION_START,
  secondsUntilResend,
  type RegistrationState,
} from "./registration-flow.ts";

const NOW = Date.parse("2026-11-12T18:00:00Z");
const ANSWER = {
  delivery: "sent" as const,
  expiresAt: "2026-11-12T18:10:00Z",
  resendAfterSeconds: 60,
};
const http = (status: number, code: string, retryAfterSeconds?: number) => ({
  kind: "http",
  status,
  code,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});

const onCode = nextRegistration(REGISTRATION_START, {
  type: "codeRequested",
  phone: "+525512345678",
  answer: ANSWER,
  now: NOW,
});

describe("phoneFromLocal", () => {
  it("reads a Mexican mobile however the diner types it", () => {
    for (const typed of [
      "5512345678",
      "55 1234 5678",
      "(55) 1234-5678",
      "+52 55 1234 5678",
      "52 5512345678",
    ]) {
      assert.equal(phoneFromLocal(typed), "+525512345678", typed);
    }
  });

  it("refuses what the API would refuse", () => {
    for (const typed of [
      "",
      "55 1234",
      "551234567890",
      "+1 555 123 4567",
      "teléfono",
    ]) {
      assert.equal(phoneFromLocal(typed), null, typed);
    }
  });
});

describe("the registration's steps", () => {
  it("goes to the code once it is sent, and may not ask for another for a while", () => {
    assert.deepEqual(onCode, {
      step: "code",
      phone: "+525512345678",
      delivery: "sent",
      resendAt: NOW + 60_000,
      problem: null,
    });
    assert.equal(secondsUntilResend(onCode, NOW + 18_200), 42);
    assert.equal(secondsUntilResend(onCode, NOW + 61_000), 0);
  });

  it("keeps a wrong code on the code, and lets an expired one ask for another now", () => {
    const wrong = nextRegistration(onCode, {
      type: "failed",
      failure: http(422, "CODE_INVALID"),
      now: NOW,
    });
    assert.equal(wrong.step, "code");
    assert.deepEqual(wrong.step === "code" && wrong.problem, {
      field: "code",
      reason: "codeInvalid",
    });

    const expired = nextRegistration(onCode, {
      type: "failed",
      failure: http(422, "CODE_EXPIRED"),
      now: NOW + 5_000,
    });
    assert.deepEqual(expired.step === "code" && expired.problem, {
      field: "code",
      reason: "codeExpired",
    });
    assert.equal(secondsUntilResend(expired, NOW + 5_000), 0);
  });

  it("sends a phone that cannot get codes back to the details", () => {
    const state = nextRegistration(REGISTRATION_START, {
      type: "failed",
      failure: http(422, "PHONE_NOT_REACHABLE"),
      now: NOW,
    });
    assert.deepEqual(state, {
      step: "details",
      problem: { field: "phone", reason: "phoneNotReachable" },
    });
  });

  it("says how long to wait after a 429, and counts it down on the code", () => {
    const early = nextRegistration(REGISTRATION_START, {
      type: "failed",
      failure: http(429, "TOO_MANY_REQUESTS", 42),
      now: NOW,
    });
    assert.deepEqual(early, {
      step: "details",
      problem: { field: "form", reason: "wait", seconds: 42 },
    });

    const resend = nextRegistration(onCode, {
      type: "failed",
      failure: http(429, "TOO_MANY_REQUESTS", 30),
      now: NOW + 10_000,
    });
    assert.equal(secondsUntilResend(resend, NOW + 10_000), 30);

    const unsaid = nextRegistration(REGISTRATION_START, {
      type: "failed",
      failure: http(429, "TOO_MANY_REQUESTS"),
      now: NOW,
    });
    assert.deepEqual(unsaid, {
      step: "details",
      problem: { field: "form", reason: "wait", seconds: 60 },
    });
  });

  it("asks to accept the current notice when the shown one is outdated", () => {
    const state = nextRegistration(onCode, {
      type: "failed",
      failure: http(409, "PRIVACY_NOTICE_OUTDATED"),
      now: NOW,
    });
    assert.deepEqual(state, {
      step: "details",
      problem: { field: "form", reason: "privacyOutdated" },
    });
  });

  it("calls an outage, a lost network or a broken answer unavailable, where the diner is", () => {
    for (const failure of [
      http(503, "CODE_PROVIDER_UNAVAILABLE"),
      { kind: "network" },
      { kind: "unexpected", status: 502 },
    ]) {
      const state = nextRegistration(onCode, {
        type: "failed",
        failure,
        now: NOW,
      });
      assert.equal(state.step, "code");
      assert.deepEqual(state.step === "code" && state.problem, {
        field: "form",
        reason: "unavailable",
      });
    }
    const invalid = nextRegistration(REGISTRATION_START, {
      type: "failed",
      failure: http(400, "VALIDATION_FAILED"),
      now: NOW,
    });
    assert.deepEqual(invalid, {
      step: "details",
      problem: { field: "form", reason: "invalid" },
    });
  });

  it("ends when the code is right, and lets the diner fix the phone before that", () => {
    assert.deepEqual(nextRegistration(onCode, { type: "verified" }), {
      step: "done",
    });
    assert.deepEqual(
      nextRegistration(onCode, { type: "changePhone" }),
      REGISTRATION_START,
    );
    const done: RegistrationState = { step: "done" };
    assert.deepEqual(
      nextRegistration(done, {
        type: "failed",
        failure: http(503, "X"),
        now: NOW,
      }),
      done,
    );
  });
});
