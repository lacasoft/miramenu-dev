import { z } from "zod";
import { pageQuerySchema, pageSchema } from "./pagination.ts";

/** Upload limits (decided 2026-11-10); the worker checks them again with ffprobe. */
export const MEDIA_LIMITS = {
  imageMaxBytes: 15 * 1024 * 1024,
  videoMaxBytes: 200 * 1024 * 1024,
  videoMaxSeconds: 60,
  /** Largest width or height accepted, in pixels. */
  maxDimension: 8192,
} as const;

/** What the admin may upload, by kind; anything else is refused before signing. */
export const MEDIA_CONTENT_TYPES = {
  image: ["image/jpeg", "image/png", "image/webp"],
  video: ["video/mp4", "video/quicktime", "video/webm"],
} as const;

export const mediaKindSchema = z.enum(["image", "video"]);
export const mediaStatusSchema = z.enum([
  "pending_upload",
  "processing",
  "ready",
  "failed",
]);
export const mediaFailureReasonSchema = z.enum([
  /** The uploaded object is not the size or type that was signed. */
  "upload_mismatch",
  "unsupported_format",
  "too_large",
  "too_long",
  "processing_error",
]);

export const createMediaRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("image"),
    contentType: z.enum(MEDIA_CONTENT_TYPES.image),
    sizeBytes: z.number().int().min(1).max(MEDIA_LIMITS.imageMaxBytes),
  }),
  z.strictObject({
    kind: z.literal("video"),
    contentType: z.enum(MEDIA_CONTENT_TYPES.video),
    sizeBytes: z.number().int().min(1).max(MEDIA_LIMITS.videoMaxBytes),
  }),
]);

const pixels = z.number().int().min(1).max(MEDIA_LIMITS.maxDimension);

/** An optimized image: WebP sources by width, for srcset (ADR-0038). */
export const menuImageSchema = z.strictObject({
  width: pixels,
  height: pixels,
  sources: z.array(z.strictObject({ width: pixels, url: z.url() })).min(1),
});

/** An optimized video: MP4 H.264 with its poster (ADR-0038). */
export const menuVideoSchema = z.strictObject({
  url: z.url(),
  width: pixels,
  height: pixels,
  durationMs: z.number().int().min(0),
  poster: menuImageSchema,
});

const timestamp = z.iso.datetime({ offset: true });

/** A medium as the admin sees it; its optimized versions appear once it is ready. */
export const mediaSchema = z.strictObject({
  id: z.uuid(),
  kind: mediaKindSchema,
  /** null for the business's own media; a branch's id for media a branch uploaded. */
  branchId: z.uuid().nullable(),
  status: mediaStatusSchema,
  contentType: z.string(),
  sizeBytes: z.number().int().min(1),
  failureReason: mediaFailureReasonSchema.nullable(),
  /** Still processing past the allowed time: the worker may be down (design: Cae el worker). */
  stalled: z.boolean(),
  image: menuImageSchema.nullable(),
  video: menuVideoSchema.nullable(),
  createdAt: timestamp,
});

/** Where the browser uploads the original: a short-lived PUT, signed with its type and size. */
export const mediaUploadSchema = z.strictObject({
  url: z.url(),
  method: z.literal("PUT"),
  headers: z.record(z.string(), z.string()),
  expiresAt: timestamp,
});

export const createdMediaSchema = z.strictObject({
  media: mediaSchema,
  upload: mediaUploadSchema,
});

export const mediaPageQuerySchema = pageQuerySchema.extend({
  /** true: only media that failed or are stalled. */
  problem: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

export const mediaPageSchema = pageSchema(mediaSchema);

export type MediaKind = z.infer<typeof mediaKindSchema>;
export type MediaStatus = z.infer<typeof mediaStatusSchema>;
export type MediaFailureReason = z.infer<typeof mediaFailureReasonSchema>;
export type CreateMediaRequest = z.infer<typeof createMediaRequestSchema>;
export type MenuImage = z.infer<typeof menuImageSchema>;
export type MenuVideo = z.infer<typeof menuVideoSchema>;
export type Media = z.infer<typeof mediaSchema>;
export type MediaUpload = z.infer<typeof mediaUploadSchema>;
export type CreatedMedia = z.infer<typeof createdMediaSchema>;
