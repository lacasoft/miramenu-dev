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

describe("the admin's businesses, branches and team", () => {
  const BUSINESS = {
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    name: "La Fonda",
    country: "MX",
    subdomain: "lafonda",
    createdAt: "2026-11-12T18:00:00.000Z",
  };
  const BRANCH = {
    id: "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60",
    businessId: BUSINESS.id,
    name: "Centro",
    slug: "centro",
    subdomain: null,
    url: "https://lafonda.mirame.nu/centro",
    createdAt: "2026-11-12T18:00:00.000Z",
  };
  const USER = {
    id: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
    email: "rosa@lafonda.example",
    name: "Rosa",
    status: "invited",
    roles: [{ businessId: BUSINESS.id, branchId: BRANCH.id, role: "branch_admin" }],
  };
  const page = <T>(item: T) => ({ items: [item], nextCursor: null });
  const B = `https://api.mirame.nu/admin/businesses/${BUSINESS.id}`;
  const R = `https://api.mirame.nu/admin/branches/${BRANCH.id}`;

  const cases: [string, (api: ReturnType<typeof createAdminApi>) => Promise<unknown>, string, string, unknown, unknown][] = [
    ["createBusiness", (api) => api.createBusiness({ name: "La Fonda", country: "MX", subdomain: "lafonda", admin: { email: "ana@lafonda.example", name: "Ana" } }), "POST", "https://api.mirame.nu/admin/businesses", { name: "La Fonda", country: "MX", subdomain: "lafonda", admin: { email: "ana@lafonda.example", name: "Ana" } }, { business: BUSINESS, admin: { id: USER.id, email: "ana@lafonda.example" }, invitation: { sent: false } }],
    ["business", (api) => api.business(BUSINESS.id), "GET", B, undefined, BUSINESS],
    ["updateBusiness", (api) => api.updateBusiness(BUSINESS.id, { subdomain: "fonda" }), "PATCH", B, { subdomain: "fonda" }, BUSINESS],
    ["branches", (api) => api.branches(BUSINESS.id, "next_1"), "GET", `${B}/branches?cursor=next_1`, undefined, page(BRANCH)],
    ["createBranch", (api) => api.createBranch(BUSINESS.id, { name: "Centro", slug: "centro" }), "POST", `${B}/branches`, { name: "Centro", slug: "centro" }, BRANCH],
    ["branch", (api) => api.branch(BRANCH.id), "GET", R, undefined, BRANCH],
    ["updateBranch", (api) => api.updateBranch(BRANCH.id, { subdomain: null }), "PATCH", R, { subdomain: null }, BRANCH],
    ["branchQr", (api) => api.branchQr(BRANCH.id), "GET", `${R}/qr`, undefined, { code: "a2b3c4d", shortUrl: "https://mirame.nu/a2b3c4d" }],
    ["team", (api) => api.team(BUSINESS.id), "GET", `${B}/users`, undefined, page(USER)],
    ["inviteUser", (api) => api.inviteUser(BUSINESS.id, { email: USER.email, name: "Rosa", role: { role: "branch_admin", branchId: BRANCH.id } }), "POST", `${B}/users`, { email: USER.email, name: "Rosa", role: { role: "branch_admin", branchId: BRANCH.id } }, { user: USER, invitation: { sent: true } }],
    ["setRoles", (api) => api.setRoles(BUSINESS.id, USER.id, [{ role: "business_admin" }]), "PUT", `${B}/users/${USER.id}/roles`, { roles: [{ role: "business_admin" }] }, USER],
    ["resendInvitation", (api) => api.resendInvitation(BUSINESS.id, USER.id), "POST", `${B}/users/${USER.id}/invitation`, undefined, { sent: true }],
  ];

  for (const [name, run, method, url, body, answer] of cases) {
    it(`${name}: ${method} with its body, its answer checked against the contract`, async () => {
      const { sent, api } = fakeTransport(() => reply(200, answer));
      assert.deepEqual(await run(api), answer);
      assert.equal(sent[0]?.method, method);
      assert.equal(sent[0]?.url, url);
      assert.deepEqual(sent[0]?.body === undefined ? undefined : JSON.parse(sent[0].body), body);
      if (body !== undefined) assert.deepEqual(sent[0]?.headers, { "content-type": "application/json" });

      const broken = await failureOf(run(fakeTransport(() => reply(200, { unexpected: true })).api));
      assert.deepEqual(broken.failure, { kind: "unexpected", status: 200 });
    });
  }

  it("removes someone's roles with a DELETE whose answer has no body", async () => {
    const { sent, api } = fakeTransport(() => reply(204));
    await api.removeRoles(BUSINESS.id, USER.id);
    assert.deepEqual(sent[0], { method: "DELETE", url: `${B}/users/${USER.id}/roles`, headers: {} });
  });

  it("encodes the ids it puts in a path", async () => {
    const { sent, api } = fakeTransport(() => reply(404, envelope("NOT_FOUND")));
    await failureOf(api.branch("../admin/session"));
    assert.equal(sent[0]?.url, "https://api.mirame.nu/admin/branches/..%2Fadmin%2Fsession");
  });

  it("carries a taken subdomain or slug as the API's own failure", async () => {
    const taken = await failureOf(
      fakeTransport(() => reply(409, envelope("SLUG_TAKEN"))).api.createBranch(BUSINESS.id, { name: "Centro", slug: "centro" }),
    );
    assert.equal(taken.failure.kind === "http" && taken.failure.code, "SLUG_TAKEN");
  });
});

describe("the admin's base menu", () => {
  const BUSINESS_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const BRANCH_ID = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
  const CATEGORY = { id: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", name: "Tacos", position: 0 };
  const DISH = {
    id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60",
    categoryId: CATEGORY.id,
    name: "Pastor",
    description: "",
    priceCents: 8550,
    currency: "MXN",
    imageId: null,
    videoId: null,
    position: 0,
  };
  const PROFILE = {
    name: "La Fonda",
    socialLinks: [{ network: "instagram", url: "https://instagram.com/lafonda" }],
    logoId: null,
  };
  const DRAFT = {
    draftVersion: 4,
    publishedVersion: null,
    profile: PROFILE,
    categories: [CATEGORY],
    dishes: [DISH],
    conflicts: [{ branchId: BRANCH_ID, dishId: DISH.id, reason: "price_changed", dishName: "Pastor" }],
    media: [],
  };
  const PUBLICATION = {
    id: "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b",
    scope: "business",
    version: 1,
    publishedAt: "2026-11-13T18:00:00.000Z",
    menus: [{ branchId: BRANCH_ID, version: 1 }],
  };
  const B = `https://api.mirame.nu/admin/businesses/${BUSINESS_ID}`;

  const cases: [string, (api: ReturnType<typeof createAdminApi>) => Promise<unknown>, string, string, unknown, unknown][] = [
    ["menuDraft", (api) => api.menuDraft(BUSINESS_ID), "GET", `${B}/menu-draft`, undefined, DRAFT],
    ["putProfile", (api) => api.putProfile(BUSINESS_ID, PROFILE as never), "PUT", `${B}/profile`, PROFILE, PROFILE],
    ["createCategory", (api) => api.createCategory(BUSINESS_ID, { name: "Tacos" }), "POST", `${B}/categories`, { name: "Tacos" }, CATEGORY],
    ["updateCategory", (api) => api.updateCategory(BUSINESS_ID, CATEGORY.id, { position: 2 }), "PATCH", `${B}/categories/${CATEGORY.id}`, { position: 2 }, CATEGORY],
    ["createDish", (api) => api.createDish(BUSINESS_ID, { categoryId: CATEGORY.id, name: "Pastor", priceCents: 8550, currency: "MXN" }), "POST", `${B}/dishes`, { categoryId: CATEGORY.id, name: "Pastor", priceCents: 8550, currency: "MXN" }, DISH],
    ["updateDish", (api) => api.updateDish(BUSINESS_ID, DISH.id, { priceCents: 9000 }), "PATCH", `${B}/dishes/${DISH.id}`, { priceCents: 9000 }, DISH],
  ];

  for (const [name, run, method, url, body, answer] of cases) {
    it(`${name}: ${method} with its body, its answer checked against the contract`, async () => {
      const { sent, api } = fakeTransport(() => reply(200, answer));
      assert.deepEqual(await run(api), answer);
      assert.equal(sent[0]?.method, method);
      assert.equal(sent[0]?.url, url);
      assert.deepEqual(sent[0]?.body === undefined ? undefined : JSON.parse(sent[0].body), body);

      const broken = await failureOf(run(fakeTransport(() => reply(200, { unexpected: true })).api));
      assert.deepEqual(broken.failure, { kind: "unexpected", status: 200 });
    });
  }

  it("removes a category or a dish with a DELETE whose answer has no body", async () => {
    const { sent, api } = fakeTransport(() => reply(204));
    await api.removeCategory(BUSINESS_ID, CATEGORY.id);
    await api.removeDish(BUSINESS_ID, DISH.id);
    assert.deepEqual(sent, [
      { method: "DELETE", url: `${B}/categories/${CATEGORY.id}`, headers: {} },
      { method: "DELETE", url: `${B}/dishes/${DISH.id}`, headers: {} },
    ]);
  });

  it("publishes with the reviewed draft version and its idempotency key in the header", async () => {
    const { sent, api } = fakeTransport(() => reply(201, PUBLICATION));
    const request = { draftVersion: 4, confirmedConflicts: [{ branchId: BRANCH_ID, dishId: DISH.id }] };
    assert.deepEqual(await api.publishBusinessMenu(BUSINESS_ID, request, "key_0123456789abcdef"), PUBLICATION);
    assert.deepEqual(sent[0], {
      method: "POST",
      url: `${B}/publications`,
      headers: { "content-type": "application/json", "Idempotency-Key": "key_0123456789abcdef" },
      body: JSON.stringify(request),
    });

    const changed = await failureOf(
      fakeTransport(() => reply(409, envelope("DRAFT_CHANGED"))).api.publishBusinessMenu(BUSINESS_ID, request, "key_0123456789abcdef"),
    );
    assert.equal(changed.failure.kind === "http" && changed.failure.code, "DRAFT_CHANGED");
  });

  it("never trusts a conflict without the dish's name", async () => {
    const { dishName: _, ...unnamed } = DRAFT.conflicts[0]!;
    const broken = await failureOf(
      fakeTransport(() => reply(200, { ...DRAFT, conflicts: [unnamed] })).api.menuDraft(BUSINESS_ID),
    );
    assert.deepEqual(broken.failure, { kind: "unexpected", status: 200 });
  });
});

describe("the admin's media (ADR-0038)", () => {
  const BUSINESS_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const B = `https://api.mirame.nu/admin/businesses/${BUSINESS_ID}`;
  const MEDIA = {
    id: "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c",
    kind: "image",
    branchId: null,
    status: "pending_upload",
    contentType: "image/jpeg",
    sizeBytes: 2048,
    failureReason: null,
    stalled: false,
    image: null,
    video: null,
    createdAt: "2026-11-13T18:00:00.000Z",
  };
  const UPLOAD = {
    url: "https://s3.example.test/originals/x?X-Amz-Signature=abc",
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    expiresAt: "2026-11-13T18:10:00.000Z",
  };

  it("asks to sign an upload with the file's kind, type and size", async () => {
    const { sent, api } = fakeTransport(() => reply(201, { media: MEDIA, upload: UPLOAD }));
    const request = { kind: "image", contentType: "image/jpeg", sizeBytes: 2048 } as const;
    assert.deepEqual(await api.createMedia(BUSINESS_ID, request), { media: MEDIA, upload: UPLOAD });
    assert.deepEqual(sent[0], {
      method: "POST",
      url: `${B}/media`,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    const broken = await failureOf(
      fakeTransport(() => reply(201, { media: MEDIA, upload: { ...UPLOAD, method: "POST" } })).api.createMedia(BUSINESS_ID, request),
    );
    assert.deepEqual(broken.failure, { kind: "unexpected", status: 201 });
  });

  it("confirms an upload with a POST without a body", async () => {
    const processing = { ...MEDIA, status: "processing" };
    const { sent, api } = fakeTransport(() => reply(200, processing));
    assert.deepEqual(await api.completeMedia(BUSINESS_ID, MEDIA.id), processing);
    assert.deepEqual(sent[0], { method: "POST", url: `${B}/media/${MEDIA.id}/complete`, headers: {} });
    const early = await failureOf(
      fakeTransport(() => reply(409, envelope("MEDIA_NOT_UPLOADED"))).api.completeMedia(BUSINESS_ID, MEDIA.id),
    );
    assert.equal(early.failure.kind === "http" && early.failure.code, "MEDIA_NOT_UPLOADED");
  });

  it("pages the media with a problem", async () => {
    const page = { items: [{ ...MEDIA, status: "failed", failureReason: "too_long" }], nextCursor: "c_2-x" };
    const { sent, api } = fakeTransport(() => reply(200, page));
    assert.deepEqual(await api.mediaProblems(BUSINESS_ID), page);
    await api.mediaProblems(BUSINESS_ID, "c_2-x");
    assert.deepEqual(
      sent.map((request) => request.url),
      [`${B}/media?problem=true`, `${B}/media?problem=true&cursor=c_2-x`],
    );
  });
});

describe("the admin's branch menu", () => {
  const BRANCH_ID = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
  const DISH_ID = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60";
  const R = `https://api.mirame.nu/admin/branches/${BRANCH_ID}`;
  const OVERRIDE = { dishId: DISH_ID, priceCents: null, available: false, hidden: false };
  const OWN = {
    id: "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d",
    categoryId: "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f",
    name: "Gringa",
    description: "",
    priceCents: 7000,
    currency: "MXN",
    imageId: null,
    videoId: null,
    position: 3,
    available: true,
  };
  const DRAFT = { draftVersion: 2, publishedVersion: 1, profile: null, overrides: [OVERRIDE], dishes: [OWN], media: [] };
  const PROFILE = { name: "La Fonda Centro", socialLinks: [], logoId: null };
  const MEDIA = {
    id: "4f5a6b7c-8d9e-4f0a-9b1c-2d3e4f5a6b7c",
    kind: "image",
    branchId: BRANCH_ID,
    status: "processing",
    contentType: "image/jpeg",
    sizeBytes: 2048,
    failureReason: null,
    stalled: false,
    image: null,
    video: null,
    createdAt: "2026-11-13T18:00:00.000Z",
  };
  const UPLOAD = { url: "https://s3.example.test/o", method: "PUT", headers: {}, expiresAt: "2026-11-13T18:10:00.000Z" };
  const PUBLICATION = {
    id: "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b",
    scope: "branch",
    version: 2,
    publishedAt: "2026-11-13T18:00:00.000Z",
    menus: [{ branchId: BRANCH_ID, version: 4 }],
  };
  const override = { priceCents: null, available: false, hidden: false };
  const ownDish = { categoryId: OWN.categoryId, name: "Gringa", priceCents: 7000, currency: "MXN" };
  const signed = { kind: "image", contentType: "image/jpeg", sizeBytes: 2048 } as const;

  const cases: [string, (api: ReturnType<typeof createAdminApi>) => Promise<unknown>, string, string, unknown, unknown][] = [
    ["branchMenuDraft", (api) => api.branchMenuDraft(BRANCH_ID), "GET", `${R}/menu-draft`, undefined, DRAFT],
    ["putOverride", (api) => api.putOverride(BRANCH_ID, DISH_ID, override), "PUT", `${R}/overrides/${DISH_ID}`, override, OVERRIDE],
    ["createBranchDish", (api) => api.createBranchDish(BRANCH_ID, ownDish), "POST", `${R}/dishes`, ownDish, OWN],
    ["updateBranchDish", (api) => api.updateBranchDish(BRANCH_ID, OWN.id, { available: false }), "PATCH", `${R}/dishes/${OWN.id}`, { available: false }, OWN],
    ["putBranchProfile", (api) => api.putBranchProfile(BRANCH_ID, PROFILE), "PUT", `${R}/profile`, PROFILE, PROFILE],
    ["createBranchMedia", (api) => api.createBranchMedia(BRANCH_ID, signed), "POST", `${R}/media`, signed, { media: MEDIA, upload: UPLOAD }],
    ["completeBranchMedia", (api) => api.completeBranchMedia(BRANCH_ID, MEDIA.id), "POST", `${R}/media/${MEDIA.id}/complete`, undefined, MEDIA],
    ["branchMediaProblems", (api) => api.branchMediaProblems(BRANCH_ID, "c_2"), "GET", `${R}/media?problem=true&cursor=c_2`, undefined, { items: [MEDIA], nextCursor: null }],
  ];

  for (const [name, run, method, url, body, answer] of cases) {
    it(`${name}: ${method} with its body, its answer checked against the contract`, async () => {
      const { sent, api } = fakeTransport(() => reply(200, answer));
      assert.deepEqual(await run(api), answer);
      assert.equal(sent[0]?.method, method);
      assert.equal(sent[0]?.url, url);
      assert.deepEqual(sent[0]?.body === undefined ? undefined : JSON.parse(sent[0].body), body);

      const broken = await failureOf(run(fakeTransport(() => reply(200, { unexpected: true })).api));
      assert.deepEqual(broken.failure, { kind: "unexpected", status: 200 });
    });
  }

  it("removes an adjustment, an own dish or the own profile with a DELETE whose answer has no body", async () => {
    const { sent, api } = fakeTransport(() => reply(204));
    await api.removeOverride(BRANCH_ID, DISH_ID);
    await api.removeBranchDish(BRANCH_ID, OWN.id);
    await api.removeBranchProfile(BRANCH_ID);
    assert.deepEqual(
      sent.map((request) => [request.method, request.url, request.body]),
      [
        ["DELETE", `${R}/overrides/${DISH_ID}`, undefined],
        ["DELETE", `${R}/dishes/${OWN.id}`, undefined],
        ["DELETE", `${R}/profile`, undefined],
      ],
    );
  });

  it("publishes the branch with its draft version and its idempotency key in the header", async () => {
    const { sent, api } = fakeTransport(() => reply(201, PUBLICATION));
    assert.deepEqual(await api.publishBranchMenu(BRANCH_ID, { draftVersion: 2 }, "key_0123456789abcdef"), PUBLICATION);
    assert.deepEqual(sent[0], {
      method: "POST",
      url: `${R}/publications`,
      headers: { "content-type": "application/json", "Idempotency-Key": "key_0123456789abcdef" },
      body: JSON.stringify({ draftVersion: 2 }),
    });
  });
});

describe("the admin's moderation (ADR-0040)", () => {
  const BUSINESS_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const BRANCH_ID = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
  const COMMENT_ID = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
  const PAGE = {
    items: [
      {
        id: COMMENT_ID,
        branchId: BRANCH_ID,
        dishId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60",
        dishName: null,
        text: "Muy rico",
        author: { name: "Dana" },
        version: 2,
        submittedAt: "2026-11-13T18:00:00.000Z",
        overdue: true,
      },
    ],
    nextCursor: "c_2",
    overdueCount: 1,
  };

  it("reads a queue of the business or of a branch, only the overdue ones, a page at a time", async () => {
    const { sent, api } = fakeTransport(() => reply(200, PAGE));
    assert.deepEqual(await api.businessModeration(BUSINESS_ID), PAGE);
    await api.businessModeration(BUSINESS_ID, { overdue: true, cursor: "c_2" });
    await api.branchModeration(BRANCH_ID, { cursor: "c_2" });
    assert.deepEqual(
      sent.map((request) => request.url),
      [
        `https://api.mirame.nu/admin/businesses/${BUSINESS_ID}/moderation`,
        `https://api.mirame.nu/admin/businesses/${BUSINESS_ID}/moderation?overdue=true&cursor=c_2`,
        `https://api.mirame.nu/admin/branches/${BRANCH_ID}/moderation?cursor=c_2`,
      ],
    );
    const unnamed = await failureOf(
      fakeTransport(() => reply(200, { ...PAGE, overdueCount: undefined })).api.branchModeration(BRANCH_ID),
    );
    assert.deepEqual(unnamed.failure, { kind: "unexpected", status: 200 });
  });

  it("approves or rejects the version the moderator read", async () => {
    const { sent, api } = fakeTransport(() => reply(204));
    await api.approveComment(COMMENT_ID, 2);
    await api.rejectComment(COMMENT_ID, 2);
    assert.deepEqual(sent, [
      {
        method: "POST",
        url: `https://api.mirame.nu/admin/comments/${COMMENT_ID}/approve`,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
      {
        method: "POST",
        url: `https://api.mirame.nu/admin/comments/${COMMENT_ID}/reject`,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: 2 }),
      },
    ]);
    const changed = await failureOf(fakeTransport(() => reply(409, envelope("COMMENT_CHANGED"))).api.approveComment(COMMENT_ID, 2));
    assert.equal(changed.failure.kind === "http" && changed.failure.code, "COMMENT_CHANGED");
  });
});

describe("the admin's metrics (ADR-0041)", () => {
  const BUSINESS_ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const BRANCH_ID = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";
  const measures = { entries: 4, views: 3, exposureMs: 9000, quickSkips: 1, likes: 2, comments: 1 };
  const METRICS = {
    period: { from: "2026-11-07T06:00:00.000Z", to: "2026-11-14T01:00:00.000Z", timeZone: "America/Mexico_City" },
    totals: { ...measures, exposureAverageMs: 3000, quickSkipRate: 0.25 },
    byDay: [{ ...measures, day: "2026-11-13" }],
    byDish: [{ ...measures, exposureAverageMs: 3000, quickSkipRate: null, dishId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60" }],
  };
  const period = { from: "2026-11-07T06:00:00.000Z", to: "2026-11-14T01:00:00.000Z", timeZone: "America/Mexico_City" };
  const query = "?from=2026-11-07T06%3A00%3A00.000Z&to=2026-11-14T01%3A00%3A00.000Z&timeZone=America%2FMexico_City";

  it("reads the figures of a business or a branch for a period in a time zone", async () => {
    const { sent, api } = fakeTransport(() => reply(200, METRICS));
    assert.deepEqual(await api.businessMetrics(BUSINESS_ID, period), METRICS);
    await api.branchMetrics(BRANCH_ID, period);
    assert.deepEqual(
      sent.map((request) => [request.method, request.url]),
      [
        ["GET", `https://api.mirame.nu/admin/businesses/${BUSINESS_ID}/metrics${query}`],
        ["GET", `https://api.mirame.nu/admin/branches/${BRANCH_ID}/metrics${query}`],
      ],
    );
  });

  it("never trusts a rate out of its range", async () => {
    const broken = await failureOf(
      fakeTransport(() => reply(200, { ...METRICS, totals: { ...METRICS.totals, quickSkipRate: 1.5 } })).api.branchMetrics(BRANCH_ID, period),
    );
    assert.deepEqual(broken.failure, { kind: "unexpected", status: 200 });
  });
});
