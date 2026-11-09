import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  acceptInvitationRequestSchema,
  createBusinessRequestSchema,
  emailSchema,
  inviteUserRequestSchema,
  passwordSchema,
  qrCodeSchema,
  setRolesRequestSchema,
  slugSchema,
  subdomainSchema,
  updateBranchRequestSchema,
} from "./business-access.ts";

const accepts = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => schema.safeParse(value).success;

describe("subdomainSchema", () => {
  it("accepts DNS labels of 3 to 63 characters", () => {
    for (const name of [
      "abc",
      "el-restaurante",
      "sucursal-2",
      "a".repeat(63),
    ]) {
      assert.equal(accepts(subdomainSchema, name), true, name);
    }
  });

  it("rejects short, long, uppercase, edge hyphens and dots", () => {
    for (const name of [
      "ab",
      "a".repeat(64),
      "ElRestaurante",
      "-abc",
      "abc-",
      "a.b.c",
      "a_b",
      "",
    ]) {
      assert.equal(accepts(subdomainSchema, name), false, name);
    }
  });

  it("rejects the names the platform reserves", () => {
    for (const name of ["admin", "api", "www"]) {
      assert.equal(accepts(subdomainSchema, name), false, name);
    }
  });
});

describe("slugSchema", () => {
  it("accepts short lowercase slugs", () => {
    for (const slug of ["c", "centro", "plaza-norte", "2"])
      assert.equal(accepts(slugSchema, slug), true, slug);
  });

  it("rejects paths, uppercase and edge hyphens", () => {
    for (const slug of ["", "Centro", "a/b", "-centro", "centro-", ".."]) {
      assert.equal(accepts(slugSchema, slug), false, slug);
    }
  });
});

describe("qrCodeSchema", () => {
  it("accepts seven characters of the unambiguous alphabet", () => {
    assert.equal(accepts(qrCodeSchema, "k7m2x9p"), true);
  });

  it("rejects ambiguous characters and other lengths", () => {
    for (const code of [
      "k7m2x90",
      "k7m2x9l",
      "k7m2x9o",
      "k7m2x9i",
      "k7m2x9",
      "k7m2x9pq",
      "K7M2X9P",
    ]) {
      assert.equal(accepts(qrCodeSchema, code), false, code);
    }
  });
});

describe("passwordSchema (ADR-0034)", () => {
  it("accepts 12 to 128 characters with no composition rules", () => {
    assert.equal(accepts(passwordSchema, "a".repeat(12)), true);
    assert.equal(accepts(passwordSchema, "a".repeat(128)), true);
    assert.equal(accepts(passwordSchema, "example only lowercase words"), true);
  });

  it("rejects fewer than 12 or more than 128", () => {
    assert.equal(accepts(passwordSchema, "a".repeat(11)), false);
    assert.equal(accepts(passwordSchema, "a".repeat(129)), false);
  });

  it("counts Unicode characters, not UTF-16 units", () => {
    // 6 emoji are 12 UTF-16 units but only 6 characters.
    assert.equal(accepts(passwordSchema, "🔑".repeat(6)), false);
    assert.equal(accepts(passwordSchema, "🔑".repeat(12)), true);
  });
});

describe("emailSchema", () => {
  it("normalizes to trimmed lowercase", () => {
    assert.equal(emailSchema.parse("  Ana@Example.TEST "), "ana@example.test");
  });

  it("rejects anything that is not an address", () => {
    assert.equal(accepts(emailSchema, "not-an-email"), false);
  });
});

describe("role targets", () => {
  const branchId = "6f1c2e0a-8b3d-4c5e-9f7a-1b2c3d4e5f60";

  it("requires a branch for branch_admin and forbids it for business_admin", () => {
    const invite = (role: unknown) => ({
      email: "a@example.test",
      name: "Ana",
      role,
    });
    assert.equal(
      accepts(
        inviteUserRequestSchema,
        invite({ role: "branch_admin", branchId }),
      ),
      true,
    );
    assert.equal(
      accepts(inviteUserRequestSchema, invite({ role: "business_admin" })),
      true,
    );
    assert.equal(
      accepts(inviteUserRequestSchema, invite({ role: "branch_admin" })),
      false,
    );
    assert.equal(
      accepts(
        inviteUserRequestSchema,
        invite({ role: "business_admin", branchId }),
      ),
      false,
    );
  });

  it("has no superadmin role to assign (RNF-08)", () => {
    assert.equal(
      accepts(setRolesRequestSchema, { roles: [{ role: "superadmin" }] }),
      false,
    );
  });
});

describe("request bodies", () => {
  it("rejects unknown fields, so nothing extra reaches the services", () => {
    const body = {
      name: "El Restaurante",
      country: "MX",
      subdomain: "elrestaurante",
      admin: { email: "ana@example.test", name: "Ana" },
      isSuperadmin: true,
    };
    assert.equal(accepts(createBusinessRequestSchema, body), false);
  });

  it("lets a branch drop its own subdomain with null, and rejects an empty update", () => {
    assert.equal(accepts(updateBranchRequestSchema, { subdomain: null }), true);
    assert.equal(accepts(updateBranchRequestSchema, {}), false);
  });

  it("takes the invitation token in the body, never in the URL (ADR-0033)", () => {
    const token = "A".repeat(43);
    assert.equal(
      accepts(acceptInvitationRequestSchema, {
        token,
        password: "example-long-enough",
      }),
      true,
    );
    assert.equal(
      accepts(acceptInvitationRequestSchema, {
        token: "short",
        password: "example-long-enough",
      }),
      false,
    );
  });
});
