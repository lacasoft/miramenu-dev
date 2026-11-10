import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  codeRequestedSchema,
  dinerNameSchema,
  phoneSchema,
  requestCodeSchema,
  verificationCodeSchema,
  verifyCodeSchema,
} from "./diners.ts";

const accepts = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => schema.safeParse(value).success;

describe("phoneSchema", () => {
  it("takes Mexican numbers in E.164", () => {
    for (const phone of ["+525512345678", "+528112345678"]) {
      assert.equal(accepts(phoneSchema, phone), true, phone);
    }
  });

  it("refuses other countries, other lengths and other formats", () => {
    for (const phone of [
      "+15551234567",
      "+52551234567",
      "+5255123456789",
      "525512345678",
      "+52 55 1234 5678",
      "+52551234567a",
      "",
    ]) {
      assert.equal(accepts(phoneSchema, phone), false, phone);
    }
  });
});

describe("verificationCodeSchema", () => {
  it("takes exactly six digits", () => {
    assert.equal(accepts(verificationCodeSchema, "012345"), true);
    for (const code of ["12345", "1234567", "12345a", " 123456"]) {
      assert.equal(accepts(verificationCodeSchema, code), false, code);
    }
  });
});

describe("dinerNameSchema", () => {
  it("trims the name and refuses empty, long or control characters", () => {
    assert.equal(dinerNameSchema.parse("  Ana  "), "Ana");
    for (const name of ["   ", "a".repeat(61), "Ana\u0000", "Ana\nLópez"]) {
      assert.equal(accepts(dinerNameSchema, name), false, JSON.stringify(name));
    }
  });
});

describe("requestCodeSchema", () => {
  it("takes only the phone", () => {
    assert.equal(accepts(requestCodeSchema, { phone: "+525512345678" }), true);
    assert.equal(
      accepts(requestCodeSchema, { phone: "+525512345678", channel: "sms" }),
      false,
    );
  });
});

describe("verifyCodeSchema", () => {
  const base = {
    phone: "+525512345678",
    code: "123456",
    name: "Ana",
    privacyNoticeVersion: "2026-11-01",
  };

  it("defaults the offers consent to false and lowercases the email", () => {
    const parsed = verifyCodeSchema.parse({
      ...base,
      email: " Ana@Example.TEST ",
    });
    assert.equal(parsed.offersConsent, false);
    assert.equal(parsed.email, "ana@example.test");
  });

  it("requires the privacy notice version and refuses unknown fields", () => {
    const { privacyNoticeVersion: _omitted, ...withoutNotice } = base;
    assert.equal(accepts(verifyCodeSchema, withoutNotice), false);
    assert.equal(accepts(verifyCodeSchema, { ...base, deviceId: "x" }), false);
  });
});

describe("codeRequestedSchema", () => {
  it("describes the delivery as sent or unconfirmed", () => {
    const response = {
      delivery: "unconfirmed",
      expiresAt: "2026-11-10T12:00:00.000Z",
      resendAfterSeconds: 60,
    };
    assert.equal(accepts(codeRequestedSchema, response), true);
    assert.equal(
      accepts(codeRequestedSchema, { ...response, delivery: "delivered" }),
      false,
    );
  });
});
