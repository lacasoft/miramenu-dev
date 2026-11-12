import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError, isNotFound, isTemporary } from "./api-error.ts";
import { createDinerApi } from "./diner-api.ts";
import type { HttpRequest, HttpResponse, Transport } from "./transport.ts";

const BRANCH = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
const DEVICE = "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const DISH = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
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

const reply = (
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): HttpResponse => ({
  status,
  header: (name) => headers[name.toLowerCase()] ?? null,
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
      deviceId: () => DEVICE,
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
      deviceId: () => DEVICE,
      baseUrl: "https://api.mirame.nu",
      transport,
    }).resolve({ subdomain: "tacos" });
    assert.equal(sent[0]?.url, "https://api.mirame.nu/resolve?subdomain=tacos");
  });

  it("reads the published menu of a branch", async () => {
    const { sent, transport } = fakeTransport(() => reply(200, MENU));
    const api = createDinerApi({
      deviceId: () => DEVICE, baseUrl: "https://api.mirame.nu", transport });

    assert.deepEqual(await api.menu(BRANCH), MENU);
    assert.equal(sent[0]?.url, `https://api.mirame.nu/branches/${BRANCH}/menu`);
  });

  it("turns the API's error envelope into a typed failure", async () => {
    const { transport } = fakeTransport(() =>
      reply(404, envelope("NOT_FOUND")),
    );
    const error = await failureOf(
      createDinerApi({
      deviceId: () => DEVICE, baseUrl: "https://api.mirame.nu", transport }).menu(
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
      deviceId: () => DEVICE,
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
      deviceId: () => DEVICE,
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
      deviceId: () => DEVICE,
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
      deviceId: () => DEVICE,
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
      createDinerApi({
      deviceId: () => DEVICE, baseUrl: "https://api.mirame.nu", transport }).menu(
        "../admin",
      ),
    );
    assert.equal(
      sent[0]?.url,
      "https://api.mirame.nu/branches/..%2Fadmin/menu",
    );
  });
});

describe("the device's calls", () => {
  const api = (transport: Transport) =>
    createDinerApi({ deviceId: () => DEVICE, baseUrl: "https://api.mirame.nu", transport });

  it("sets a like as the device, with its id and a JSON body", async () => {
    const { sent, transport } = fakeTransport(() => reply(200, { active: true, likes: 3 }));

    assert.deepEqual(await api(transport).like(BRANCH, DISH, true), { active: true, likes: 3 });
    assert.deepEqual(sent, [
      {
        method: "PUT",
        url: `https://api.mirame.nu/branches/${BRANCH}/dishes/${DISH}/like`,
        headers: { "content-type": "application/json", "x-device-id": DEVICE },
        body: '{"active":true}',
      },
    ]);
  });

  it("asks for the device's likes with its id", async () => {
    const { sent, transport } = fakeTransport(() => reply(200, { dishIds: [DISH] }));

    assert.deepEqual(await api(transport).myLikes(BRANCH), { dishIds: [DISH] });
    assert.deepEqual(sent[0]?.headers, { "x-device-id": DEVICE });
  });

  it("reads everyone's counts with a plain GET, so no preflight is needed", async () => {
    const counts = { dishes: [{ dishId: DISH, likes: 3, comments: 1 }] };
    const { sent, transport } = fakeTransport(() => reply(200, counts));

    assert.deepEqual(await api(transport).interactions(BRANCH), counts);
    assert.deepEqual(sent[0], {
      method: "GET",
      url: `https://api.mirame.nu/branches/${BRANCH}/interactions`,
      headers: {},
    });
  });

  it("reports a dish that left the menu as the API's own error", async () => {
    const { transport } = fakeTransport(() => reply(404, envelope("DISH_NOT_ON_MENU")));
    const error = await failureOf(api(transport).like(BRANCH, DISH, true));
    assert.equal(error.failure.kind === "http" && error.failure.code, "DISH_NOT_ON_MENU");
  });
});

describe("registration, session and comments", () => {
  const api = (transport: Transport) =>
    createDinerApi({ deviceId: () => DEVICE, baseUrl: "https://api.mirame.nu", transport });
  const COMMENT = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";
  const OWN = {
    id: COMMENT,
    branchId: BRANCH,
    dishId: DISH,
    text: "Muy rico",
    status: "pending",
    version: 1,
    submittedAt: "2026-11-12T18:00:00.000Z",
  };

  it("reads the privacy notice in force with a plain GET", async () => {
    const notice = { version: "2026-11", url: "https://mirame.nu/privacidad" };
    const { sent, transport } = fakeTransport(() => reply(200, notice));
    assert.deepEqual(await api(transport).privacyNotice(), notice);
    assert.deepEqual(sent[0]?.headers, {});
  });

  it("asks for a code as the device", async () => {
    const answer = { delivery: "sent", expiresAt: "2026-11-12T18:10:00.000Z", resendAfterSeconds: 60 };
    const { sent, transport } = fakeTransport(() => reply(202, answer));

    assert.deepEqual(await api(transport).requestCode("+525512345678"), answer);
    assert.deepEqual(sent[0], {
      method: "POST",
      url: "https://api.mirame.nu/registration/code",
      headers: { "content-type": "application/json", "x-device-id": DEVICE },
      body: '{"phone":"+525512345678"}',
    });
  });

  it("carries how long to wait after a 429, from Retry-After", async () => {
    const { transport } = fakeTransport(() =>
      reply(429, envelope("TOO_MANY_REQUESTS"), { "retry-after": "42" }),
    );
    const error = await failureOf(api(transport).requestCode("+525512345678"));
    assert.equal(error.failure.kind === "http" && error.failure.retryAfterSeconds, 42);

    const dated = fakeTransport(() =>
      reply(429, envelope("TOO_MANY_REQUESTS"), { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" }),
    );
    const undated = await failureOf(api(dated.transport).requestCode("+525512345678"));
    assert.equal(undated.failure.kind === "http" && undated.failure.retryAfterSeconds, undefined);
  });

  it("tells a diner without a session apart from a failure", async () => {
    const none = fakeTransport(() => reply(401, envelope("UNAUTHENTICATED")));
    assert.equal(await api(none.transport).session(), null);

    const session = { diner: { id: COMMENT, name: "Ana" } };
    const some = fakeTransport(() => reply(200, session));
    assert.deepEqual(await api(some.transport).session(), session);

    const down = fakeTransport(() => reply(503, envelope("SERVICE_UNAVAILABLE")));
    await failureOf(api(down.transport).session());
  });

  it("signs out with a DELETE whose answer has no body", async () => {
    const { sent, transport } = fakeTransport(() => reply(204, ""));
    await api(transport).signOut();
    assert.equal(sent[0]?.method, "DELETE");
    assert.equal(sent[0]?.url, "https://api.mirame.nu/diner/session");
  });

  it("pages the approved comments by cursor, without custom headers", async () => {
    const page = { items: [], nextCursor: null };
    const { sent, transport } = fakeTransport(() => reply(200, page));

    await api(transport).comments(BRANCH, DISH);
    await api(transport).comments(BRANCH, DISH, "abc/=");
    assert.equal(sent[0]?.url, `https://api.mirame.nu/branches/${BRANCH}/dishes/${DISH}/comments`);
    assert.equal(sent[1]?.url, `https://api.mirame.nu/branches/${BRANCH}/dishes/${DISH}/comments?cursor=abc%2F%3D`);
    assert.deepEqual(sent[1]?.headers, {});
  });

  it("posts, lists, edits and deletes the diner's own comments", async () => {
    const { sent, transport } = fakeTransport((request) =>
      request.method === "DELETE"
        ? reply(204, "")
        : request.url.endsWith("/comments/mine")
          ? reply(200, { items: [OWN], nextCursor: null })
          : reply(request.method === "POST" ? 201 : 200, OWN),
    );
    const client = api(transport);
    const clientId = "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c";

    assert.deepEqual(await client.postComment({ branchId: BRANCH, dishId: DISH, text: "Muy rico", clientId }), OWN);
    assert.deepEqual((await client.myComments()).items, [OWN]);
    assert.deepEqual(await client.editComment(COMMENT, "Rico"), OWN);
    await client.deleteComment(COMMENT);

    assert.deepEqual(
      sent.map((request) => `${request.method} ${request.url.replace("https://api.mirame.nu", "")}`),
      ["POST /comments", "GET /comments/mine", `PATCH /comments/${COMMENT}`, `DELETE /comments/${COMMENT}`],
    );
    assert.equal(sent[0]?.body, JSON.stringify({ branchId: BRANCH, dishId: DISH, text: "Muy rico", clientId }));
    assert.ok(sent.every((request) => request.headers["x-device-id"] === DEVICE));
  });
});
