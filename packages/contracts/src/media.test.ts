import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createMediaRequestSchema,
  MEDIA_LIMITS,
  mediaPageQuerySchema,
  menuImageSchema,
} from "./media.ts";

const accepts = (
  schema: { safeParse(value: unknown): { success: boolean } },
  value: unknown,
) => schema.safeParse(value).success;

describe("createMediaRequestSchema", () => {
  it("takes the allowed types of each kind, up to its size limit", () => {
    for (const request of [
      { kind: "image", contentType: "image/jpeg", sizeBytes: 1 },
      {
        kind: "image",
        contentType: "image/webp",
        sizeBytes: MEDIA_LIMITS.imageMaxBytes,
      },
      {
        kind: "video",
        contentType: "video/mp4",
        sizeBytes: MEDIA_LIMITS.videoMaxBytes,
      },
      { kind: "video", contentType: "video/quicktime", sizeBytes: 10 },
    ]) {
      assert.equal(
        accepts(createMediaRequestSchema, request),
        true,
        JSON.stringify(request),
      );
    }
  });

  it("refuses a type of the other kind, an unknown type and oversized files", () => {
    for (const request of [
      { kind: "image", contentType: "video/mp4", sizeBytes: 10 },
      { kind: "video", contentType: "image/png", sizeBytes: 10 },
      { kind: "image", contentType: "image/svg+xml", sizeBytes: 10 },
      {
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: MEDIA_LIMITS.imageMaxBytes + 1,
      },
      {
        kind: "video",
        contentType: "video/mp4",
        sizeBytes: MEDIA_LIMITS.videoMaxBytes + 1,
      },
      { kind: "video", contentType: "video/mp4", sizeBytes: 0 },
      { kind: "audio", contentType: "audio/mpeg", sizeBytes: 10 },
    ]) {
      assert.equal(
        accepts(createMediaRequestSchema, request),
        false,
        JSON.stringify(request),
      );
    }
  });

  it("refuses fields that are not part of the contract", () => {
    assert.equal(
      accepts(createMediaRequestSchema, {
        kind: "image",
        contentType: "image/jpeg",
        sizeBytes: 10,
        key: "media/../secrets",
      }),
      false,
    );
  });
});

describe("menuImageSchema", () => {
  it("needs at least one source", () => {
    assert.equal(
      accepts(menuImageSchema, { width: 10, height: 10, sources: [] }),
      false,
    );
  });
});

describe("mediaPageQuerySchema", () => {
  it("reads the problem filter from the query string", () => {
    assert.equal(mediaPageQuerySchema.parse({ problem: "true" }).problem, true);
    assert.equal(
      mediaPageQuerySchema.parse({ problem: "false" }).problem,
      false,
    );
    assert.equal(mediaPageQuerySchema.parse({}).problem, undefined);
    assert.equal(accepts(mediaPageQuerySchema, { problem: "yes" }), false);
  });
});
