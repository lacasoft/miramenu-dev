import {
  createMediaRequestSchema,
  MEDIA_CONTENT_TYPES,
  MEDIA_LIMITS,
  type CreateMediaRequest,
  type Media,
  type MediaFailureReason,
  type MediaKind,
  type MediaUpload,
  type MenuImage,
} from "@miramenu/contracts";
import type { CallFailure } from "./failures.ts";

/** What the browser says of a chosen file. */
export interface FileFacts {
  type: string;
  size: number;
}

export type MediaFileProblem = "empty" | "format" | "tooLarge";

const MAX_BYTES: Readonly<Record<MediaKind, number>> = {
  image: MEDIA_LIMITS.imageMaxBytes,
  video: MEDIA_LIMITS.videoMaxBytes,
};

const allowedTypes = (kind: MediaKind): readonly string[] =>
  MEDIA_CONTENT_TYPES[kind];

/** A file the API will sign, checked before anything is sent (the contract's limits). */
export function mediaFileProblemOf(
  kind: MediaKind,
  file: FileFacts,
): MediaFileProblem | null {
  if (file.size === 0) return "empty";
  if (!allowedTypes(kind).includes(file.type)) return "format";
  return file.size > MAX_BYTES[kind] ? "tooLarge" : null;
}

/** The file picker's filter: only the types the API takes for that kind. */
export const acceptOf = (kind: MediaKind): string =>
  allowedTypes(kind).join(",");

/** The request that signs the upload of a file without problems; the contract checks it again. */
export function mediaRequestOf(kind: MediaKind, file: FileFacts): CreateMediaRequest {
  if (mediaFileProblemOf(kind, file) !== null) throw new Error("not an uploadable file");
  return createMediaRequestSchema.parse({ kind, contentType: file.type, sizeBytes: file.size });
}

/**
 * Where an upload stands: the medium created with its signed PUT, the file in storage,
 * the upload confirmed. Each step that worked is kept, so a retry goes on from there.
 */
export interface UploadProgress {
  created: { mediaId: string; upload: MediaUpload } | null;
  uploaded: boolean;
  completed: boolean;
}

export const NEW_UPLOAD: UploadProgress = {
  created: null,
  uploaded: false,
  completed: false,
};

export type UploadStep = "create" | "upload" | "complete" | "attach";

/** A signed PUT this close to expiring is signed again instead of risking a 403. */
const SIGNATURE_MARGIN_MS = 30_000;

export function uploadStepOf(
  progress: UploadProgress,
  now: number,
): UploadStep {
  const { created } = progress;
  if (created === null) return "create";
  if (!progress.uploaded)
    return Date.parse(created.upload.expiresAt) - now > SIGNATURE_MARGIN_MS
      ? "upload"
      : "create";
  return progress.completed ? "attach" : "complete";
}

export type UploadProblem =
  "unavailable" | "rejected" | "failed" | "forbidden" | "gone" | "invalid";

const status = (failure: CallFailure) =>
  failure.kind === "http" ? failure.status : undefined;

/** A refusal that says the medium is unusable: the next try starts with a new one. */
function startOver(failure: CallFailure): UploadProblem | null {
  if (failure.code === "MEDIA_REJECTED") return "rejected";
  if (failure.code === "MEDIA_FAILED") return "failed";
  if (
    failure.code === "MEDIA_NOT_FOUND" ||
    failure.code === "MEDIA_KIND_MISMATCH"
  )
    return "invalid";
  return null;
}

function problemOf(failure: CallFailure): UploadProblem {
  if (status(failure) === 403) return "forbidden";
  if (status(failure) === 404) return "gone";
  if (status(failure) === 400) return "invalid";
  return "unavailable";
}

/**
 * What a failed step means, and from where the next try goes on. Storage refusing the
 * PUT (an expired or broken signature) signs a new one; a confirmation that finds no file
 * uploads it again; a medium refused or failed starts over; anything else retries the
 * same step, which the API makes safe (confirming twice, attaching twice).
 */
export function afterUploadFailure(
  step: UploadStep,
  failure: CallFailure,
  progress: UploadProgress,
): { progress: UploadProgress; problem: UploadProblem } {
  if (step === "upload")
    return {
      progress: status(failure) === 403 ? NEW_UPLOAD : progress,
      problem: "unavailable",
    };
  const over = step === "create" ? null : startOver(failure);
  if (over !== null) return { progress: NEW_UPLOAD, problem: over };
  if (failure.code === "MEDIA_NOT_UPLOADED")
    return {
      progress: { ...progress, uploaded: false, completed: false },
      problem: "unavailable",
    };
  return { progress, problem: problemOf(failure) };
}

/** What a slot shows of the medium it names, from the media its draft carries. */
export type MediaState =
  | { kind: "none" }
  | { kind: "missing" }
  | { kind: "processing"; stalled: boolean }
  | { kind: "ready"; preview: MenuImage | null }
  | { kind: "failed"; reason: MediaFailureReason | null };

/** A photo's own image, or a video's poster. */
export const previewOf = (media: Media): MenuImage | null =>
  media.image ?? media.video?.poster ?? null;

export function mediaStateOf(
  mediaId: string | null,
  media: ReadonlyMap<string, Media>,
): MediaState {
  if (mediaId === null) return { kind: "none" };
  const found = media.get(mediaId);
  if (found === undefined) return { kind: "missing" };
  switch (found.status) {
    case "ready":
      return { kind: "ready", preview: previewOf(found) };
    case "failed":
      return { kind: "failed", reason: found.failureReason };
    default:
      return { kind: "processing", stalled: found.stalled };
  }
}

/** The narrowest source at least `width` wide, or the widest there is: a thumbnail's file. */
export function sourceFor(
  image: MenuImage,
  width: number,
): { url: string; width: number } {
  const sorted = [...image.sources].sort((a, b) => a.width - b.width);
  return (
    sorted.find((source) => source.width >= width) ?? sorted[sorted.length - 1]!
  );
}

/** How often to read the draft again while one of its media is still processing. */
export const MEDIA_POLL_MS = 4000;

export const mediaPollIntervalOf = (media: readonly Media[]): number | false =>
  media.some((each) => each.status === "processing") ? MEDIA_POLL_MS : false;

/**
 * The states of the draft's media in one word: it changes when one of them gets ready,
 * fails or stalls, which is when the list of media with a problem must be read again.
 */
export const mediaStatesOf = (media: readonly Media[]): string =>
  media.map((each) => `${each.id}:${each.status}:${each.stalled ? 1 : 0}`).join(",");
