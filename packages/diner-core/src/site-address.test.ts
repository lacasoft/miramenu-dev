import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { siteAddressOf } from "./site-address.ts";

const SITE = "mirame.nu";
const at = (hostname: string, pathname = "/") =>
  siteAddressOf({ hostname, pathname }, SITE);

describe("siteAddressOf", () => {
  it("reads a branch with its own subdomain from the host alone", () => {
    assert.deepEqual(at("tacos-centro.mirame.nu"), {
      subdomain: "tacos-centro",
    });
  });

  it("reads the slug of a branch under its business's subdomain (ADR-0029)", () => {
    assert.deepEqual(at("lafonda.mirame.nu", "/centro"), {
      subdomain: "lafonda",
      slug: "centro",
    });
    assert.deepEqual(at("lafonda.mirame.nu", "/centro/"), {
      subdomain: "lafonda",
      slug: "centro",
    });
  });

  it("keeps only the first segment: the rest are the PWA's own screens", () => {
    assert.deepEqual(at("lafonda.mirame.nu", "/centro/feed"), {
      subdomain: "lafonda",
      slug: "centro",
    });
  });

  it("ignores letter case in the host, as browsers do", () => {
    assert.deepEqual(at("LaFonda.Mirame.NU", "/centro"), {
      subdomain: "lafonda",
      slug: "centro",
    });
  });

  it("works with the local development site", () => {
    assert.deepEqual(
      siteAddressOf(
        { hostname: "tacos.miramenu.localhost", pathname: "/norte" },
        "miramenu.localhost",
      ),
      { subdomain: "tacos", slug: "norte" },
    );
  });

  it("is not a restaurant on the bare site, a reserved name or another domain", () => {
    assert.equal(at("mirame.nu", "/centro"), null);
    assert.equal(at("www.mirame.nu"), null);
    assert.equal(at("api.mirame.nu"), null);
    assert.equal(at("admin.mirame.nu"), null);
    assert.equal(at("tacos.evil.example"), null);
    assert.equal(at("tacosmirame.nu"), null);
  });

  it("is not a restaurant with a nested subdomain or a malformed slug", () => {
    assert.equal(at("a.tacos.mirame.nu"), null);
    assert.equal(at("lafonda.mirame.nu", "/Centro"), null);
    assert.equal(at("lafonda.mirame.nu", "/-centro"), null);
    assert.equal(at("lafonda.mirame.nu", "/centro%20norte"), null);
  });
});
