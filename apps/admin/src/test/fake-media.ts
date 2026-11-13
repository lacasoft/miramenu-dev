import type {
  CreateMediaRequest,
  Media,
  MediaFailureReason,
  MediaUpload,
  SessionActor,
} from "@miramenu/contracts";
import { vi } from "vitest";
import type { PutFile } from "../platform/upload";
import { httpError, id } from "./fake-admin";
import { emptyMenu, type MenuState } from "./fake-menu";
import { accessIn, type World } from "./fake-world";

const STORAGE = "https://s3.example.test/originals";

let next = 1200;
const fresh = () => id((next += 1));

function menuIn(world: World, businessId: string): MenuState {
  world.menus ??= {};
  return (world.menus[businessId] ??= emptyMenu());
}

/** Every medium of the world, with the menu that holds it. */
function find(
  world: World,
  mediaId: string,
): { menu: MenuState; media: Media } | null {
  for (const menu of Object.values(world.menus ?? {})) {
    const media = menu.media.find((each) => each.id === mediaId);
    if (media !== undefined) return { menu, media };
  }
  return null;
}

/** The media calls of the API over a world, as the given person (ADR-0038). */
export function mediaApi(world: World, actor: () => SessionActor | null) {
  const { administer, businessAt } = accessIn(world, actor);
  const scope = (businessId: string) => {
    businessAt(businessId);
    administer(businessId);
    return menuIn(world, businessId);
  };
  return {
    createMedia: vi.fn(
      async (businessId: string, request: CreateMediaRequest) => {
        const menu = scope(businessId);
        const media: Media = {
          id: fresh(),
          kind: request.kind,
          branchId: null,
          status: "pending_upload",
          contentType: request.contentType,
          sizeBytes: request.sizeBytes,
          failureReason: null,
          stalled: false,
          image: null,
          video: null,
          createdAt: "2026-11-13T17:00:00.000Z",
        };
        menu.media.push(media);
        const upload: MediaUpload = {
          url: `${STORAGE}/${media.id}`,
          method: "PUT",
          headers: { "Content-Type": request.contentType },
          expiresAt: "2099-01-01T00:00:00.000Z",
        };
        return { media: { ...media }, upload };
      },
    ),
    completeMedia: vi.fn(async (businessId: string, mediaId: string) => {
      const menu = scope(businessId);
      const media = menu.media.find((each) => each.id === mediaId);
      if (media === undefined) throw httpError(404, "NOT_FOUND");
      if (media.status === "failed") throw httpError(409, "MEDIA_FAILED");
      if (media.status === "pending_upload") {
        if (!menu.stored.includes(mediaId))
          throw httpError(409, "MEDIA_NOT_UPLOADED");
        media.status = "processing";
      }
      return { ...media };
    }),
    mediaProblems: vi.fn(async (businessId: string) => {
      const menu = scope(businessId);
      const items = menu.media.filter(
        (each) => each.status === "failed" || each.stalled,
      );
      return { items: structuredClone(items), nextCursor: null };
    }),
  };
}

/** Storage: a PUT to a signed URL stores the file, saying it went out in two halves. */
export const fakePutFile = (world: World) =>
  vi.fn<PutFile>(async (upload, _file, onProgress) => {
    const found = find(world, upload.url.slice(STORAGE.length + 1));
    if (found === null) throw new Error(`no medium for ${upload.url}`);
    onProgress(0.5);
    onProgress(1);
    found.menu.stored.push(found.media.id);
  });

/** What the worker leaves on a medium it optimized: its variants, under example URLs. */
function optimized(media: Media): Partial<Media> {
  const image = {
    width: 960,
    height: 720,
    sources: [480, 960].map((width) => ({ width, url: `https://media.example.test/${media.id}/${width}.webp` })),
  };
  if (media.kind === "image") return { status: "ready", stalled: false, image };
  const video = { url: `https://media.example.test/${media.id}.mp4`, width: 1280, height: 720, durationMs: 3000, poster: image };
  return { status: "ready", stalled: false, video };
}

/** The worker's outcome: ready with its variants, failed with its reason, or stalled. */
export function settleMedia(world: World, mediaId: string, outcome: "ready" | "stalled" | MediaFailureReason) {
  const found = find(world, mediaId);
  if (found === null) throw new Error(`no medium ${mediaId}`);
  if (outcome === "stalled") found.media.stalled = true;
  else if (outcome === "ready") Object.assign(found.media, optimized(found.media));
  else Object.assign(found.media, { status: "failed", failureReason: outcome, stalled: false });
}

/** A photo or video of the business, already optimized by the worker. */
export function readyMedia(n: number, kind: "image" | "video" = "image"): Media {
  const media: Media = {
    id: id(n),
    kind,
    branchId: null,
    status: "processing",
    contentType: kind === "image" ? "image/jpeg" : "video/mp4",
    sizeBytes: 2048,
    failureReason: null,
    stalled: false,
    image: null,
    video: null,
    createdAt: "2026-11-13T17:00:00.000Z",
  };
  return { ...media, ...optimized(media) };
}
