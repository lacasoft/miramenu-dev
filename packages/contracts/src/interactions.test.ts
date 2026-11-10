import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COMMENT_MAX_LENGTH,
  commentTextSchema,
  createCommentSchema,
  likeRequestSchema,
  moderateCommentSchema,
  moderationQuerySchema,
} from "./interactions.ts";

const accepts = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => schema.safeParse(value).success;

describe("commentTextSchema", () => {
  it("trims the text and takes up to 280 characters, counted as code points", () => {
    assert.equal(commentTextSchema.parse("  ¡Muy rico!  "), "¡Muy rico!");
    assert.equal(
      accepts(commentTextSchema, "a".repeat(COMMENT_MAX_LENGTH)),
      true,
    );
    assert.equal(
      accepts(commentTextSchema, "🌮".repeat(COMMENT_MAX_LENGTH)),
      true,
    );
    assert.equal(
      accepts(commentTextSchema, "a".repeat(COMMENT_MAX_LENGTH + 1)),
      false,
    );
  });

  it("keeps line breaks and refuses empty text or other control characters", () => {
    assert.equal(accepts(commentTextSchema, "Rico\nde verdad"), true);
    for (const text of ["   ", "Rico\u0000", "Rico\u0007", "Rico\r\nrico"]) {
      assert.equal(
        accepts(commentTextSchema, text),
        false,
        JSON.stringify(text),
      );
    }
  });
});

describe("createCommentSchema", () => {
  const base = {
    branchId: "7f9c1d2e-3b4a-4c5d-8e6f-0a1b2c3d4e5f",
    dishId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    text: "Rico",
    clientId: "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
  };

  it("needs the client's id, so a retry never posts twice", () => {
    assert.equal(accepts(createCommentSchema, base), true);
    const { clientId: _omitted, ...withoutClientId } = base;
    assert.equal(accepts(createCommentSchema, withoutClientId), false);
    assert.equal(
      accepts(createCommentSchema, { ...base, status: "approved" }),
      false,
    );
  });
});

describe("likeRequestSchema", () => {
  it("sets the state; it is not a toggle", () => {
    assert.equal(accepts(likeRequestSchema, { active: true }), true);
    assert.equal(accepts(likeRequestSchema, { active: false }), true);
    assert.equal(accepts(likeRequestSchema, {}), false);
    assert.equal(accepts(likeRequestSchema, { active: "true" }), false);
  });
});

describe("moderation", () => {
  it("takes the version the moderator read", () => {
    assert.equal(accepts(moderateCommentSchema, { version: 1 }), true);
    assert.equal(accepts(moderateCommentSchema, {}), false);
    assert.equal(accepts(moderateCommentSchema, { version: 0 }), false);
  });

  it("filters overdue comments only when asked", () => {
    assert.equal(moderationQuerySchema.parse({}).overdue, false);
    assert.equal(
      moderationQuerySchema.parse({ overdue: "true" }).overdue,
      true,
    );
    assert.equal(accepts(moderationQuerySchema, { overdue: "yes" }), false);
  });
});
