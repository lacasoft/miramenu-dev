import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SessionActor } from "@miramenu/contracts";
import { accessOf, hasAccess, sectionsOf } from "./access.ts";
import { invitationProblemOf, invitationTokenOf, passwordProblemOf } from "./invitation.ts";
import { secondsUntil, signInProblemOf } from "./sign-in.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = (roles: SessionActor["roles"], isSuperadmin = false): SessionActor => ({
  user: { id: id(1), email: "ana@lafonda.example", name: "Ana" },
  isSuperadmin,
  roles,
});
const NOW = Date.parse("2026-11-12T18:00:00Z");
const http = (status: number, code = "X", retryAfterSeconds?: number) => ({
  kind: "http",
  status,
  code,
  ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
});

describe("what each person reaches", () => {
  it("groups the roles by business: the whole business, or some of its branches", () => {
    const access = accessOf(
      actor([
        { businessId: id(10), branchId: null, role: "business_admin" },
        { businessId: id(20), branchId: id(21), role: "branch_admin" },
        { businessId: id(20), branchId: id(22), role: "branch_admin" },
        { businessId: id(20), branchId: id(22), role: "branch_admin" },
      ]),
    );
    assert.deepEqual(access, [
      { businessId: id(10), administers: true, branchIds: [] },
      { businessId: id(20), administers: false, branchIds: [id(21), id(22)] },
    ]);
  });

  it("gives the superadmin access without a role, and nothing to someone without roles", () => {
    assert.equal(hasAccess(actor([], true)), true);
    assert.deepEqual(sectionsOf(actor([], true)), ["home"]);
    assert.equal(hasAccess(actor([])), false);
    assert.deepEqual(sectionsOf(actor([])), []);
  });
});

describe("signing in", () => {
  it("says a wrong email or password without telling which", () => {
    assert.deepEqual(signInProblemOf(http(401, "INVALID_CREDENTIALS"), NOW), {
      reason: "invalidCredentials",
    });
  });

  it("waits what Retry-After says after too many tries, a minute if it says nothing", () => {
    const wait = signInProblemOf(http(429, "TOO_MANY_REQUESTS", 42), NOW);
    assert.deepEqual(wait, { reason: "wait", until: NOW + 42_000 });
    assert.equal(secondsUntil(NOW + 42_000, NOW + 1_500), 41);
    assert.equal(secondsUntil(NOW + 42_000, NOW + 50_000), 0);
    assert.deepEqual(signInProblemOf(http(429), NOW), { reason: "wait", until: NOW + 60_000 });
  });

  it("calls a closed login, an outage or a lost network unavailable", () => {
    for (const failure of [http(503, "LOGIN_UNAVAILABLE"), { kind: "network" }, { kind: "unexpected", status: 502 }])
      assert.deepEqual(signInProblemOf(failure, NOW), { reason: "unavailable" });
    assert.deepEqual(signInProblemOf(http(400, "VALIDATION_FAILED"), NOW), { reason: "invalid" });
  });
});

describe("accepting an invitation", () => {
  const TOKEN = "Ab3_-".repeat(8) + "xyz";

  it("reads the token from the fragment only when it has the token's shape", () => {
    assert.equal(TOKEN.length, 43);
    assert.equal(invitationTokenOf(`#token=${TOKEN}`), TOKEN);
    assert.equal(invitationTokenOf(`#other=1&token=${TOKEN}`), TOKEN);
    for (const fragment of ["", "#", "#token=", "#token=short", `#token=${TOKEN}x`, `#token=${TOKEN.slice(1)}!`])
      assert.equal(invitationTokenOf(fragment), null, fragment);
  });

  it("asks for 12 to 128 characters counted as the API counts them, and a matching confirmation", () => {
    assert.equal(passwordProblemOf("corta", "corta"), "tooShort");
    assert.equal(passwordProblemOf("x".repeat(129), "x".repeat(129)), "tooLong");
    assert.equal(passwordProblemOf("una frase larga", "una frase largo"), "mismatch");
    assert.equal(passwordProblemOf("una frase larga", "una frase larga"), null);
    // Twelve emoji are twelve characters for the API, though 24 UTF-16 units.
    const emoji = "🌮".repeat(12);
    assert.equal(passwordProblemOf(emoji, emoji), null);
    assert.equal(passwordProblemOf("🌮".repeat(11), "🌮".repeat(11)), "tooShort");
  });

  it("tells a used invitation from an expired one", () => {
    assert.equal(invitationProblemOf(http(404, "INVITATION_NOT_FOUND")), "used");
    assert.equal(invitationProblemOf(http(410, "INVITATION_EXPIRED")), "expired");
    assert.equal(invitationProblemOf(http(400, "VALIDATION_FAILED")), "invalid");
    assert.equal(invitationProblemOf({ kind: "network" }), "unavailable");
    assert.equal(invitationProblemOf(http(503, "SERVICE_UNAVAILABLE")), "unavailable");
  });
});
