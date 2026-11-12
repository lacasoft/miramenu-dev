import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paramsOf } from "./query.ts";
import { hrefOf, needsSession, routeOf, safeNext, type AdminRoute } from "./routes.ts";

const at = (pathname: string, search = "") => routeOf({ pathname, search });

describe("the admin's routes", () => {
  it("reads each screen from its path, and anything else as not found", () => {
    assert.deepEqual(at("/"), { screen: "home" });
    assert.deepEqual(at("/invitation"), { screen: "invitation" });
    assert.deepEqual(at("/invitation/"), { screen: "invitation" });
    assert.deepEqual(at("/login"), { screen: "signIn", next: null, notice: null });
    assert.deepEqual(at("/nowhere"), { screen: "notFound" });
    assert.deepEqual(at("/login/extra"), { screen: "notFound" });
  });

  it("carries where to go back and why the admin is signing in, ignoring unknown notices", () => {
    assert.deepEqual(at("/login", "?next=%2F&notice=ended"), { screen: "signIn", next: "/", notice: "ended" });
    assert.deepEqual(at("/login", "?notice=invited"), { screen: "signIn", next: null, notice: "invited" });
    assert.deepEqual(at("/login", "?notice=%3Cscript%3E"), { screen: "signIn", next: null, notice: null });
  });

  it("writes each route back to the URL it was read from", () => {
    const routes: AdminRoute[] = [
      { screen: "home" },
      { screen: "invitation" },
      { screen: "signIn", next: null, notice: null },
      { screen: "signIn", next: "/", notice: "ended" },
      { screen: "signIn", next: null, notice: "invited" },
    ];
    for (const route of routes) {
      const href = hrefOf(route);
      const [pathname = "", search = ""] = href.split(/(?=\?)/);
      assert.deepEqual(routeOf({ pathname, search }), route, href);
    }
  });

  it("puts everything behind the session but signing in and the invitation", () => {
    assert.equal(needsSession({ screen: "home" }), true);
    assert.equal(needsSession({ screen: "notFound" }), true);
    assert.equal(needsSession({ screen: "invitation" }), false);
    assert.equal(needsSession({ screen: "signIn", next: null, notice: null }), false);
  });
});

describe("going back after signing in", () => {
  it("keeps a page of the app behind the session, with its query", () => {
    assert.equal(safeNext("/"), "/");
    assert.equal(safeNext("/?tab=1#top"), "/?tab=1");
  });

  it("never leaves the app, nor loops into signing in again (CWE-601)", () => {
    for (const next of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "javascript:alert(1)",
      "evil",
      "/login",
      "/login?next=%2F",
      "/invitation#token=x",
      "/\u0000",
      "",
    ]) {
      assert.equal(safeNext(next), null, next);
    }
    assert.deepEqual(at("/login", "?next=https%3A%2F%2Fevil.example"), {
      screen: "signIn",
      next: null,
      notice: null,
    });
  });
});

describe("paramsOf", () => {
  it("reads a query or a fragment, decoding its values, the first of a name winning", () => {
    const params = paramsOf("?a=1&b=dos+tres&a=2&c&d=%E2%9C%93&bad=%zz");
    assert.equal(params.get("a"), "1");
    assert.equal(params.get("b"), "dos tres");
    assert.equal(params.get("c"), "");
    assert.equal(params.get("d"), "✓");
    assert.equal(params.has("bad"), false);
    assert.equal(paramsOf("#token=abc").get("token"), "abc");
  });
});
