import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { errorResponseSchema, GENERIC_ERROR_CODES } from "./error.ts";

describe("errorResponseSchema", () => {
  it("accepts the envelope the design defines: code, message and request id", () => {
    const body = {
      code: "NOT_FOUND",
      message: "Not found",
      requestId: "b4b0a9f2-7f1e-4f0e-9a51-1c0d2f3e4a5b",
    };
    assert.deepEqual(errorResponseSchema.parse(body), body);
  });

  it("rejects extra fields, so internals such as a stack never leak through the contract", () => {
    const result = errorResponseSchema.safeParse({
      code: "INTERNAL_ERROR",
      message: "x",
      requestId: "r",
      stack: "at …",
    });
    assert.equal(result.success, false);
  });

  it("rejects codes that are not UPPER_SNAKE_CASE", () => {
    for (const code of [
      "not_found",
      "NotFound",
      "_NOT_FOUND",
      "NOT__FOUND",
      "NOT_FOUND_",
      "",
    ]) {
      assert.equal(
        errorResponseSchema.safeParse({ code, message: "x", requestId: "r" })
          .success,
        false,
        code,
      );
    }
  });

  it("rejects an empty message or request id", () => {
    assert.equal(
      errorResponseSchema.safeParse({
        code: "NOT_FOUND",
        message: "",
        requestId: "r",
      }).success,
      false,
    );
    assert.equal(
      errorResponseSchema.safeParse({
        code: "NOT_FOUND",
        message: "x",
        requestId: "",
      }).success,
      false,
    );
  });

  it("only declares generic codes that the schema itself accepts", () => {
    for (const code of Object.values(GENERIC_ERROR_CODES)) {
      assert.equal(
        errorResponseSchema.safeParse({ code, message: "x", requestId: "r" })
          .success,
        true,
        code,
      );
    }
  });
});
