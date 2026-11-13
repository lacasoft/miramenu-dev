import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Media } from "@miramenu/contracts";
import {
  acceptOf,
  afterUploadFailure,
  MEDIA_POLL_MS,
  mediaFileProblemOf,
  mediaPollIntervalOf,
  mediaRequestOf,
  mediaStateOf,
  mediaStatesOf,
  NEW_UPLOAD,
  sourceFor,
  uploadStepOf,
  type UploadProgress,
} from "./media.ts";

const MB = 1024 * 1024;
const NOW = Date.parse("2026-11-13T18:00:00.000Z");
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const http = (status: number, code = "X") => ({ kind: "http", status, code });
const created = (expiresAt = "2026-11-13T18:10:00.000Z"): UploadProgress => ({
  created: { mediaId: id(1), upload: { url: "https://s3.example.test/o", method: "PUT", headers: {}, expiresAt } },
  uploaded: false,
  completed: false,
});
const image = (widths: number[]) => ({
  width: 1440,
  height: 1080,
  sources: widths.map((width) => ({ width, url: `https://media.example.test/${width}.webp` })),
});
const medium = (extra: Partial<Media> = {}): Media => ({
  id: id(1),
  kind: "image",
  branchId: null,
  status: "processing",
  contentType: "image/jpeg",
  sizeBytes: 1000,
  failureReason: null,
  stalled: false,
  image: null,
  video: null,
  createdAt: "2026-11-13T17:00:00.000Z",
  ...extra,
});

describe("the files the admin picks", () => {
  it("takes the contract's types and sizes for each kind, before anything is sent", () => {
    assert.equal(mediaFileProblemOf("image", { type: "image/webp", size: 15 * MB }), null);
    assert.equal(mediaFileProblemOf("image", { type: "image/webp", size: 15 * MB + 1 }), "tooLarge");
    assert.equal(mediaFileProblemOf("image", { type: "image/gif", size: 10 }), "format");
    assert.equal(mediaFileProblemOf("image", { type: "", size: 10 }), "format");
    assert.equal(mediaFileProblemOf("image", { type: "video/mp4", size: 10 }), "format");
    assert.equal(mediaFileProblemOf("video", { type: "video/quicktime", size: 200 * MB }), null);
    assert.equal(mediaFileProblemOf("video", { type: "video/mp4", size: 200 * MB + 1 }), "tooLarge");
    assert.equal(mediaFileProblemOf("video", { type: "video/mp4", size: 0 }), "empty");
    assert.equal(acceptOf("image"), "image/jpeg,image/png,image/webp");
  });

  it("asks to sign exactly the file's type and size", () => {
    assert.deepEqual(mediaRequestOf("video", { type: "video/webm", size: 2048 }), {
      kind: "video",
      contentType: "video/webm",
      sizeBytes: 2048,
    });
    assert.throws(() => mediaRequestOf("image", { type: "image/gif", size: 10 }));
  });
});

describe("an upload, step by step (ADR-0038)", () => {
  it("goes on from the last step that worked", () => {
    assert.equal(uploadStepOf(NEW_UPLOAD, NOW), "create");
    assert.equal(uploadStepOf(created(), NOW), "upload");
    assert.equal(uploadStepOf({ ...created(), uploaded: true }, NOW), "complete");
    assert.equal(uploadStepOf({ ...created(), uploaded: true, completed: true }, NOW), "attach");
  });

  it("signs again a PUT about to expire, instead of sending it to be refused", () => {
    assert.equal(uploadStepOf(created("2026-11-13T18:00:31.000Z"), NOW), "upload");
    assert.equal(uploadStepOf(created("2026-11-13T18:00:29.000Z"), NOW), "create");
    assert.equal(uploadStepOf({ ...created("2026-11-13T17:00:00.000Z"), uploaded: true }, NOW), "complete");
  });

  it("retries the same step after an outage or a lost answer", () => {
    for (const step of ["create", "upload", "complete", "attach"] as const) {
      const progress = created();
      const after = afterUploadFailure(step, { kind: "network" }, progress);
      assert.equal(after.progress, progress, step);
      assert.equal(after.problem, "unavailable", step);
    }
    assert.equal(afterUploadFailure("complete", http(503, "SERVICE_UNAVAILABLE"), created()).problem, "unavailable");
  });

  it("signs a new PUT when storage refuses the signature", () => {
    assert.deepEqual(afterUploadFailure("upload", http(403), created()), { progress: NEW_UPLOAD, problem: "unavailable" });
    assert.deepEqual(afterUploadFailure("upload", http(500), created()).progress, created());
  });

  it("uploads again when the confirmation finds no file, and starts over with a refused medium", () => {
    const uploaded = { ...created(), uploaded: true };
    assert.deepEqual(afterUploadFailure("complete", http(409, "MEDIA_NOT_UPLOADED"), uploaded), {
      progress: created(),
      problem: "unavailable",
    });
    assert.deepEqual(afterUploadFailure("complete", http(422, "MEDIA_REJECTED"), uploaded), { progress: NEW_UPLOAD, problem: "rejected" });
    assert.deepEqual(afterUploadFailure("complete", http(409, "MEDIA_FAILED"), uploaded), { progress: NEW_UPLOAD, problem: "failed" });
    const done = { ...uploaded, completed: true };
    assert.deepEqual(afterUploadFailure("attach", http(409, "MEDIA_FAILED"), done), { progress: NEW_UPLOAD, problem: "failed" });
    assert.deepEqual(afterUploadFailure("attach", http(422, "MEDIA_KIND_MISMATCH"), done), { progress: NEW_UPLOAD, problem: "invalid" });
  });

  it("says a refusal of who or what, keeping what was done", () => {
    const done = { ...created(), uploaded: true, completed: true };
    assert.deepEqual(afterUploadFailure("attach", http(404, "NOT_FOUND"), done), { progress: done, problem: "gone" });
    assert.equal(afterUploadFailure("create", http(403, "FORBIDDEN"), NEW_UPLOAD).problem, "forbidden");
    assert.equal(afterUploadFailure("create", http(400, "VALIDATION_FAILED"), NEW_UPLOAD).problem, "invalid");
  });
});

describe("what a slot shows", () => {
  it("reads the medium it names from the draft's media", () => {
    const media = new Map([
      [id(1), medium()],
      [id(2), medium({ id: id(2), stalled: true })],
      [id(3), medium({ id: id(3), status: "failed", failureReason: "too_long" })],
      [id(4), medium({ id: id(4), status: "ready", image: image([480, 960]) })],
      [id(5), medium({ id: id(5), kind: "video", status: "ready", video: { url: "https://media.example.test/v.mp4", width: 1280, height: 720, durationMs: 3000, poster: image([480]) } })],
    ]);
    assert.deepEqual(mediaStateOf(null, media), { kind: "none" });
    assert.deepEqual(mediaStateOf(id(9), media), { kind: "missing" });
    assert.deepEqual(mediaStateOf(id(1), media), { kind: "processing", stalled: false });
    assert.deepEqual(mediaStateOf(id(2), media), { kind: "processing", stalled: true });
    assert.deepEqual(mediaStateOf(id(3), media), { kind: "failed", reason: "too_long" });
    assert.deepEqual(mediaStateOf(id(4), media), { kind: "ready", preview: image([480, 960]) });
    assert.deepEqual(mediaStateOf(id(5), media), { kind: "ready", preview: image([480]) });
  });

  it("draws a thumbnail from the narrowest source wide enough, or the widest there is", () => {
    assert.equal(sourceFor(image([1440, 480, 960]), 192).width, 480);
    assert.equal(sourceFor(image([480, 960]), 600).width, 960);
    assert.equal(sourceFor(image([300]), 600).width, 300);
  });

  it("changes its word for the media's states when one gets ready, fails or stalls", () => {
    const processing = [medium(), medium({ id: id(2), status: "ready" })];
    const word = mediaStatesOf(processing);
    assert.equal(mediaStatesOf(structuredClone(processing)), word);
    assert.notEqual(mediaStatesOf([medium({ status: "failed" }), processing[1]!]), word);
    assert.notEqual(mediaStatesOf([medium({ stalled: true }), processing[1]!]), word);
    assert.equal(mediaStatesOf([]), "");
  });

  it("reads the draft again only while one of its media is processing", () => {
    assert.equal(mediaPollIntervalOf([]), false);
    assert.equal(mediaPollIntervalOf([medium({ status: "ready" }), medium({ status: "failed" })]), false);
    assert.equal(mediaPollIntervalOf([medium({ status: "ready" }), medium({ stalled: true })]), MEDIA_POLL_MS);
  });
});
