import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, isNotFound, isTemporary } from "./api-error.ts";
import { createDinerApi } from "./diner-api.ts";
import type { HttpRequest, HttpResponse, Transport } from "./transport.ts";

const BRANCH = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const BUSINESS = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const MENU = {
  branchId: BRANCH,
  version: 3,
  publishedAt: "2026-11-12T18:00:00.000Z",
  profile: { name: "La Fonda", socialLinks: [], logo: null },
  categories: [
    {
      id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
      name: "Tacos",
      dishes: [
        {
          id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
          name: "Taco de pastor",
          description: "Con piña",
          priceCents: 2500,
          currency: "MXN",
          available: true,
          image: null,
          video: null,
        },
      ],
    },
  ],
};

/** A transport that records each request and answers with the given response. */
function fakeTransport(answer: (request: HttpRequest) => HttpResponse) {
  const sent: HttpRequest[] = [];
  const transport: Transport = async (request) => {
    sent.push(request);
    return answer(request);
  };
  return { sent, transport };
}

const reply = (status: number, body: unknown): HttpResponse => ({
  status,
  text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
});

const envelope = (code: string) => ({
  code,
  message: "message",
  requestId: "req-1",
});

async function failureOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof ApiError);
    return error;
  }
  assert.fail("the call should have failed");
}

describe("createDinerApi", () => {
  it("resolves a subdomain and slug with a plain GET, so no preflight is needed", async () => {
    const resolution = {
      businessId: BUSINESS,
      branchId: BRANCH,
      canonicalUrl: "https://lafonda.mirame.nu/centro",
    };
    const { sent, transport } = fakeTransport(() => reply(200, resolution));
    const api = createDinerApi({
      baseUrl: "https://api.mirame.nu/",
      transport,
    });

    assert.deepEqual(
      await api.resolve({ subdomain: "lafonda", slug: "centro" }),
      resolution,
    );
    assert.deepEqual(sent, [
      {
        method: "GET",
        url: "https://api.mirame.nu/resolve?subdomain=lafonda&slug=centro",
        headers: {},
      },
    ]);
  });

  it("leaves the slug out for a branch with its own subdomain", async () => {
    const { sent, transport } = fakeTransport(() =>
      reply(200, {
        businessId: BUSINESS,
        branchId: BRANCH,
        canonicalUrl: "https://tacos.mirame.nu/",
      }),
    );
    await createDinerApi({
      baseUrl: "https://api.mirame.nu",
      transport,
    }).resolve({ subdomain: "tacos" });
    assert.equal(sent[0]?.url, "https://api.mirame.nu/resolve?subdomain=tacos");
  });

  it("reads the published menu of a branch", async () => {
    const { sent, transport } = fakeTransport(() => reply(200, MENU));
    const api = createDinerApi({ baseUrl: "https://api.mirame.nu", transport });

    assert.deepEqual(await api.menu(BRANCH), MENU);
    assert.equal(sent[0]?.url, `https://api.mirame.nu/branches/${BRANCH}/menu`);
  });

  it("turns the API's error envelope into a typed failure", async () => {
    const { transport } = fakeTransport(() =>
      reply(404, envelope("NOT_FOUND")),
    );
    const error = await failureOf(
      createDinerApi({ baseUrl: "https://api.mirame.nu", transport }).menu(
        BRANCH,
      ),
    );

    assert.deepEqual(error.failure, {
      kind: "http",
      status: 404,
      code: "NOT_FOUND",
      message: "message",
      requestId: "req-1",
    });
    assert.equal(isNotFound(error), true);
    assert.equal(isTemporary(error), false);
  });

  it("marks a dependency outage and a lost network as temporary", async () => {
    const down = fakeTransport(() =>
      reply(503, envelope("SERVICE_UNAVAILABLE")),
    );
    const outage = await failureOf(
      createDinerApi({
        baseUrl: "https://api.mirame.nu",
        transport: down.transport,
      }).menu(BRANCH),
    );
    assert.equal(isTemporary(outage), true);
    assert.equal(isNotFound(outage), false);

    const offline: Transport = async () => {
      throw new TypeError("Failed to fetch");
    };
    const lost = await failureOf(
      createDinerApi({
        baseUrl: "https://api.mirame.nu",
        transport: offline,
      }).menu(BRANCH),
    );
    assert.deepEqual(lost.failure, { kind: "network" });
    assert.equal(isTemporary(lost), true);
  });

  it("never trusts an answer outside the contract, and never echoes its body", async () => {
    const proxyPage = fakeTransport(() =>
      reply(502, "<html>Bad gateway: upstream 10.0.0.7</html>"),
    );
    const gateway = await failureOf(
      createDinerApi({
        baseUrl: "https://api.mirame.nu",
        transport: proxyPage.transport,
      }).menu(BRANCH),
    );
    assert.deepEqual(gateway.failure, { kind: "unexpected", status: 502 });
    assert.equal(isTemporary(gateway), true);
    assert.doesNotMatch(gateway.message, /10\.0\.0\.7/);

    const changed = fakeTransport(() =>
      reply(200, { ...MENU, version: "three" }),
    );
    const drift = await failureOf(
      createDinerApi({
        baseUrl: "https://api.mirame.nu",
        transport: changed.transport,
      }).menu(BRANCH),
    );
    assert.deepEqual(drift.failure, { kind: "unexpected", status: 200 });
    assert.equal(isTemporary(drift), false);
  });

  it("encodes the values it puts in a URL", async () => {
    const { sent, transport } = fakeTransport(() =>
      reply(404, envelope("NOT_FOUND")),
    );
    await failureOf(
      createDinerApi({ baseUrl: "https://api.mirame.nu", transport }).menu(
        "../admin",
      ),
    );
    assert.equal(
      sent[0]?.url,
      "https://api.mirame.nu/branches/..%2Fadmin/menu",
    );
  });
});
