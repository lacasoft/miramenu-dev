import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BusinessUser, SessionActor } from "@miramenu/contracts";
import { canAdminister, canCreateBusiness } from "./access.ts";
import {
  emailProblemOf,
  loadProblemOf,
  nameProblemOf,
  saveProblemOf,
  slugProblemOf,
  subdomainProblemOf,
} from "./forms.ts";
import { qrFileNameOf, qrPathOf, qrSvgOf } from "./qr.ts";
import { roleChoiceOf, roleChoiceProblemOf, roleTargetsOf } from "./roles.ts";
import { hrefOf, routeOf, type AdminRoute } from "./routes.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const actor = (roles: SessionActor["roles"], isSuperadmin = false): SessionActor => ({
  user: { id: id(1), email: "ana@lafonda.example", name: "Ana" },
  isSuperadmin,
  roles,
});
const http = (status: number, code = "X") => ({ kind: "http", status, code });

describe("the pages of businesses, branches and team", () => {
  it("reads each one from its path, ids checked, and writes it back", () => {
    const routes: [string, AdminRoute][] = [
      ["/businesses/new", { screen: "newBusiness" }],
      [`/businesses/${id(10)}`, { screen: "business", businessId: id(10) }],
      [`/businesses/${id(10)}/team`, { screen: "team", businessId: id(10) }],
      [`/branches/${id(11)}`, { screen: "branch", branchId: id(11) }],
    ];
    for (const [path, route] of routes) {
      assert.deepEqual(routeOf({ pathname: path, search: "" }), route, path);
      assert.equal(hrefOf(route), path);
    }
    for (const path of [
      "/businesses",
      "/businesses/x",
      "/businesses/6F1C2E0A-8B3D-4C5E-9F7A-1B2C3D4E5F60",
      `/businesses/${id(10)}/teams`,
      `/businesses/${id(10)}/team/more`,
      "/branches/new",
      `/branches/${id(11)}/qr`,
    ])
      assert.deepEqual(routeOf({ pathname: path, search: "" }), { screen: "notFound" }, path);
  });
});

describe("who changes what", () => {
  it("lets the business's admin and the superadmin administer it, and no branch admin", () => {
    const owner = actor([{ businessId: id(10), branchId: null, role: "business_admin" }]);
    assert.equal(canAdminister(owner, id(10)), true);
    assert.equal(canAdminister(owner, id(20)), false);
    assert.equal(canAdminister(actor([{ businessId: id(10), branchId: id(11), role: "branch_admin" }]), id(10)), false);
    assert.equal(canAdminister(actor([], true), id(99)), true);
  });

  it("leaves creating a business to the superadmin", () => {
    assert.equal(canCreateBusiness(actor([], true)), true);
    assert.equal(canCreateBusiness(actor([{ businessId: id(10), branchId: null, role: "business_admin" }])), false);
  });
});

describe("the forms", () => {
  it("asks for a name of 1 to 120 characters", () => {
    assert.equal(nameProblemOf("  "), "required");
    assert.equal(nameProblemOf("x".repeat(121)), "tooLong");
    assert.equal(nameProblemOf(`  ${"x".repeat(120)} `), null);
  });

  it("takes a subdomain the API takes, and names a reserved one", () => {
    assert.equal(subdomainProblemOf(""), "required");
    assert.equal(subdomainProblemOf("admin"), "reserved");
    assert.equal(subdomainProblemOf("api"), "reserved");
    for (const bad of ["ab", "-fonda", "fonda-", "La Fonda", "fonda.mx", "x".repeat(64)])
      assert.equal(subdomainProblemOf(bad), "format", bad);
    assert.equal(subdomainProblemOf("la-fonda-2"), null);
  });

  it("takes a slug of one or more letters, digits and inner hyphens", () => {
    assert.equal(slugProblemOf(""), "required");
    assert.equal(slugProblemOf("c"), null);
    assert.equal(slugProblemOf("centro-2"), null);
    for (const bad of ["Centro", "-centro", "centro-", "centro norte"]) assert.equal(slugProblemOf(bad), "format", bad);
  });

  it("checks an email as the API will", () => {
    assert.equal(emailProblemOf(" "), "required");
    assert.equal(emailProblemOf("rosa"), "format");
    assert.equal(emailProblemOf(" Rosa@LaFonda.example "), null);
  });

  it("puts a taken address on its field, and says the rest for the form", () => {
    assert.deepEqual(saveProblemOf(http(409, "SUBDOMAIN_TAKEN")), { field: "subdomain", reason: "taken" });
    assert.deepEqual(saveProblemOf(http(409, "SLUG_TAKEN")), { field: "slug", reason: "taken" });
    assert.deepEqual(saveProblemOf(http(409, "USER_ALREADY_ACTIVE")), { field: "form", reason: "alreadyActive" });
    assert.deepEqual(saveProblemOf(http(422, "BRANCH_NOT_IN_BUSINESS")), { field: "form", reason: "branchGone" });
    assert.deepEqual(saveProblemOf(http(400, "VALIDATION_FAILED")), { field: "form", reason: "invalid" });
    assert.deepEqual(saveProblemOf(http(403, "FORBIDDEN")), { field: "form", reason: "forbidden" });
    assert.deepEqual(saveProblemOf(http(404, "NOT_FOUND")), { field: "form", reason: "notFound" });
    assert.deepEqual(saveProblemOf({ kind: "network" }), { field: "form", reason: "unavailable" });
  });

  it("tells a page outside the person's scope from one that is not theirs to see", () => {
    assert.equal(loadProblemOf(http(404, "NOT_FOUND")), "notFound");
    assert.equal(loadProblemOf(http(403, "FORBIDDEN")), "forbidden");
    assert.equal(loadProblemOf(http(503, "SERVICE_UNAVAILABLE")), "unavailable");
  });
});

describe("roles", () => {
  const user = (roles: BusinessUser["roles"]): BusinessUser => ({
    id: id(5),
    email: "rosa@lafonda.example",
    name: "Rosa",
    status: "active",
    roles,
  });

  it("reads a person's roles in this business as one choice", () => {
    assert.deepEqual(roleChoiceOf(user([{ businessId: id(10), branchId: null, role: "business_admin" }]), id(10)), { kind: "business" });
    assert.deepEqual(
      roleChoiceOf(
        user([
          { businessId: id(10), branchId: id(11), role: "branch_admin" },
          { businessId: id(10), branchId: id(12), role: "branch_admin" },
          { businessId: id(20), branchId: id(21), role: "branch_admin" },
        ]),
        id(10),
      ),
      { kind: "branches", branchIds: [id(11), id(12)] },
    );
    assert.equal(roleChoiceOf(user([{ businessId: id(20), branchId: null, role: "business_admin" }]), id(10)), null);
  });

  it("turns a choice into the roles the API takes, and needs a branch for a branch admin", () => {
    assert.deepEqual(roleTargetsOf({ kind: "business" }), [{ role: "business_admin" }]);
    assert.deepEqual(roleTargetsOf({ kind: "branches", branchIds: [id(11), id(12)] }), [
      { role: "branch_admin", branchId: id(11) },
      { role: "branch_admin", branchId: id(12) },
    ]);
    assert.equal(roleChoiceProblemOf({ kind: "branches", branchIds: [] }), "noBranch");
    assert.equal(roleChoiceProblemOf({ kind: "business" }), null);
  });
});

describe("the QR code's picture", () => {
  const modules = [
    [true, true, false, true],
    [false, false, false, false],
    [true, false, true, true],
    [true, true, true, true],
  ];

  it("draws each run of dark modules as one rectangle, and nothing for the light ones", () => {
    assert.equal(qrPathOf(modules), "M0 0h2v1h-2zM3 0h1v1h-1zM0 2h1v1h-1zM2 2h2v1h-2zM0 3h4v1h-4z");
    // As many dark modules as the matrix has, counted from the path's widths.
    const widths = [...qrPathOf(modules).matchAll(/h(\d+)v1/g)].reduce((sum, [, w]) => sum + Number(w), 0);
    assert.equal(widths, modules.flat().filter(Boolean).length);
  });

  it("writes a file black on white, with an escaped title and a module of 10 units", () => {
    const svg = qrSvgOf(modules, 'La "Fonda" <Centro> & Co');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 4 4" width="40" height="40"/);
    assert.match(svg, /<title>La &#34;Fonda&#34; &#60;Centro&#62; &#38; Co<\/title>/);
    assert.match(svg, /<rect width="4" height="4" fill="#FFFFFF"\/><path d="M0 0h2/);
    assert.equal(qrFileNameOf("centro", "png"), "qr-centro.png");
  });
});
