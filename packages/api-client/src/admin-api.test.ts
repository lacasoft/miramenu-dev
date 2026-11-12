import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, isUnauthorized } from "./api-error.ts";
import { createAdminApi } from "./admin-api.ts";
import type { HttpRequest, HttpResponse, Transport } from "./transport.ts";

const ACTOR = {
  user: {
    id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    email: "ana@lafonda.example",
    name: "Ana",
  },
  isSuperadmin: false,
  roles: [
    {
      businessId: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      branchId: null,
      role: "business_admin",
    },
  ],
};
const TOKEN = "a".repeat(43);

function fakeTransport(answer: (request: HttpRequest) => HttpResponse) {
  const sent: HttpRequest[] = [];
  const transport: Transport = async (request) => {
    sent.push(request);
    return answer(request);
  };
  return { sent, api: createAdminApi({ baseUrl: "https://api.mirame.nu/", transport }) };
}

const reply = (
  status: number,
  body: unknown = "",
  headers: Readonly<Record<string, string>> = {},
): HttpResponse => ({
  status,
  header: (name) => headers[name.toLowerCase()] ?? null,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const envelope = (code: string) => ({ code, message: code, requestId: "req-1" });

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError);
    return error;
  }
  assert.fail("the call should have failed");
}

describe("createAdminApi", () => {
  it("signs in with a JSON POST and nothing else: the cookie is the API's to set", async () => {
    const { sent, api } = fakeTransport(() => reply(204));
    await api.signIn({ email: "ana@lafonda.example", password: "una frase larga" });

    assert.deepEqual(sent, [
      {
        method: "POST",
        url: "https://api.mirame.nu/admin/session",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "ana@lafonda.example", password: "una frase larga" }),
      },
    ]);
  });

  it("carries a wrong password, a wait and an outage as the API's own failures", async () => {
    const invalid = await failureOf(
      fakeTransport(() => reply(401, envelope("INVALID_CREDENTIALS"))).api.signIn({
        email: "ana@lafonda.example",
        password: "x",
      }),
    );
    assert.equal(invalid.failure.kind === "http" && invalid.failure.code, "INVALID_CREDENTIALS");

    const wait = await failureOf(
      fakeTransport(() => reply(429, envelope("TOO_MANY_REQUESTS"), { "retry-after": "42" })).api.signIn({
        email: "ana@lafonda.example",
        password: "x",
      }),
    );
    assert.equal(wait.failure.kind === "http" && wait.failure.retryAfterSeconds, 42);

    const down = await failureOf(
      fakeTransport(() => reply(503, envelope("LOGIN_UNAVAILABLE"))).api.signIn({
        email: "ana@lafonda.example",
        password: "x",
      }),
    );
    assert.equal(down.failure.kind === "http" && down.failure.code, "LOGIN_UNAVAILABLE");
  });

  it("reads who is signed in, and tells a missing session apart from a failure", async () => {
    const { sent, api } = fakeTransport(() => reply(200, ACTOR));
    assert.deepEqual(await api.session(), ACTOR);
    assert.deepEqual(sent[0], { method: "GET", url: "https://api.mirame.nu/admin/session", headers: {} });

    assert.equal(await fakeTransport(() => reply(401, envelope("UNAUTHORIZED"))).api.session(), null);
    const down = await failureOf(fakeTransport(() => reply(503, envelope("SERVICE_UNAVAILABLE"))).api.session());
    assert.equal(isUnauthorized(down), false);
  });

  it("never trusts a session outside the contract", async () => {
    const broken = await failureOf(
      fakeTransport(() => reply(200, { ...ACTOR, isSuperadmin: "yes" })).api.session(),
    );
    assert.deepEqual(broken.failure, { kind: "unexpected", status: 200 });
  });

  it("signs out with a DELETE whose answer has no body", async () => {
    const { sent, api } = fakeTransport(() => reply(204));
    await api.signOut();
    assert.deepEqual(sent[0], { method: "DELETE", url: "https://api.mirame.nu/admin/session", headers: {} });
  });

  it("accepts an invitation with the token in the body, never in the URL (ADR-0033)", async () => {
    const { sent, api } = fakeTransport(() => reply(204));
    await api.acceptInvitation(TOKEN, "una frase larga");

    assert.equal(sent[0]?.url, "https://api.mirame.nu/admin/invitations/accept");
    assert.ok(!sent[0]?.url.includes(TOKEN));
    assert.deepEqual(JSON.parse(sent[0]?.body ?? "{}"), { token: TOKEN, password: "una frase larga" });

    const used = await failureOf(
      fakeTransport(() => reply(404, envelope("INVITATION_NOT_FOUND"))).api.acceptInvitation(TOKEN, "x"),
    );
    assert.equal(used.failure.kind === "http" && used.failure.status, 404);
  });

  it("pages the businesses this person reaches by cursor", async () => {
    const page = {
      items: [
        {
          id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          name: "La Fonda",
          country: "MX",
          subdomain: "lafonda",
          createdAt: "2026-11-12T18:00:00.000Z",
        },
      ],
      nextCursor: "c_2-x",
    };
    const { sent, api } = fakeTransport(() => reply(200, page));
    assert.deepEqual(await api.businesses(), page);
    await api.businesses("c_2-x");
    assert.deepEqual(
      sent.map((request) => request.url),
      ["https://api.mirame.nu/admin/businesses", "https://api.mirame.nu/admin/businesses?cursor=c_2-x"],
    );
  });

  it("marks only a 401 as a missing session", () => {
    const http = (status: number) =>
      new ApiError({ kind: "http", status, code: "X", message: "x", requestId: "r" });
    assert.equal(isUnauthorized(http(401)), true);
    assert.equal(isUnauthorized(http(403)), false);
    assert.equal(isUnauthorized(new ApiError({ kind: "network" })), false);
    assert.equal(isUnauthorized(new Error("401")), false);
  });
});
