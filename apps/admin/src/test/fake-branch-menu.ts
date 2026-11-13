import type {
  BranchDish,
  BranchMenuDraft,
  CreateBranchDishRequest,
  CreateMediaRequest,
  Media,
  MediaKind,
  Override,
  Profile,
  Publication,
  PublishBranchMenuRequest,
  PutOverrideRequest,
  PutProfileRequest,
  SessionActor,
  UpdateBranchDishRequest,
} from "@miramenu/contracts";
import { vi } from "vitest";
import { httpError, id } from "./fake-admin";
import { emptyMenu, type MenuState } from "./fake-menu";
import { accessIn, type World } from "./fake-world";

/** A branch's draft in memory, and what it published. */
export interface BranchMenuState {
  draftVersion: number;
  publishedVersion: number | null;
  profile: Profile | null;
  overrides: Override[];
  dishes: BranchDish[];
  publications: Map<string, { request: string; publication: Publication }>;
  /** The base's categories the business has published; all of the draft's when not given. */
  publishedCategories?: string[];
}

export const emptyBranchMenu = (
  extra: Partial<BranchMenuState> = {},
): BranchMenuState => ({
  draftVersion: 0,
  publishedVersion: null,
  profile: null,
  overrides: [],
  dishes: [],
  publications: new Map(),
  ...extra,
});

export const branchDishOf = (
  n: number,
  categoryId: string,
  name: string,
  priceCents: number,
  available = true,
): BranchDish => ({
  id: id(n),
  categoryId,
  name,
  description: "",
  priceCents,
  currency: "MXN",
  imageId: null,
  videoId: null,
  position: 100 + n,
  available,
});

const defined = <T extends object>(update: T) =>
  Object.fromEntries(
    Object.entries(update).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

let next = 1500;
const fresh = () => id((next += 1));

/** The calls of a branch's menu over a world, as the given person: the API's rules, in memory. */
export function branchMenuApi(world: World, actor: () => SessionActor | null) {
  const { branchAt } = accessIn(world, actor);
  const scope = (branchId: string) => {
    const branch = branchAt(branchId);
    world.menus ??= {};
    world.branchMenus ??= {};
    const base: MenuState = (world.menus[branch.businessId] ??= emptyMenu());
    const own = (world.branchMenus[branchId] ??= emptyBranchMenu());
    return { branch, base, own };
  };
  /** Every reader of the branch may change it ('operate' equals 'view' for a branch). */
  const edit = <T>(
    branchId: string,
    work: (state: ReturnType<typeof scope>) => T,
  ): T => {
    const state = scope(branchId);
    const result = work(state);
    state.own.draftVersion += 1;
    return result;
  };
  /** Its business's media and its own, never a sibling's (ADR-0038). */
  const usable = (
    state: ReturnType<typeof scope>,
    mediaId: string | null | undefined,
    kind: MediaKind,
  ) => {
    if (mediaId === null || mediaId === undefined) return;
    const found = state.base.media.find(
      (each) =>
        each.id === mediaId &&
        (each.branchId === null || each.branchId === state.branch.id),
    );
    if (found === undefined) throw httpError(404, "MEDIA_NOT_FOUND");
    if (found.kind !== kind) throw httpError(422, "MEDIA_KIND_MISMATCH");
    if (found.status === "pending_upload")
      throw httpError(409, "MEDIA_NOT_UPLOADED");
    if (found.status === "failed") throw httpError(409, "MEDIA_FAILED");
  };
  const ownDish = (state: ReturnType<typeof scope>, dishId: string) => {
    const dish = state.own.dishes.find((each) => each.id === dishId);
    if (dish === undefined) throw httpError(404, "NOT_FOUND");
    return dish;
  };

  return {
    branchMenuDraft: vi.fn(
      async (branchId: string): Promise<BranchMenuDraft> => {
        const { base, own } = scope(branchId);
        const used = new Set([
          own.profile?.logoId,
          ...own.dishes.flatMap((dish) => [dish.imageId, dish.videoId]),
        ]);
        return structuredClone({
          draftVersion: own.draftVersion,
          publishedVersion: own.publishedVersion,
          profile: own.profile,
          overrides: own.overrides,
          dishes: own.dishes,
          media: base.media.filter((each) => used.has(each.id)),
        });
      },
    ),
    putOverride: vi.fn(
      async (branchId: string, dishId: string, input: PutOverrideRequest) =>
        edit(branchId, ({ base, own }) => {
          if (!base.dishes.some((dish) => dish.id === dishId))
            throw httpError(404, "NOT_FOUND");
          const override = { dishId, ...input };
          own.overrides = [
            ...own.overrides.filter((each) => each.dishId !== dishId),
            override,
          ];
          return { ...override };
        }),
    ),
    removeOverride: vi.fn(async (branchId: string, dishId: string) =>
      edit(branchId, ({ own }) => {
        if (!own.overrides.some((each) => each.dishId === dishId))
          throw httpError(404, "NOT_FOUND");
        own.overrides = own.overrides.filter((each) => each.dishId !== dishId);
      }),
    ),
    createBranchDish: vi.fn(
      async (branchId: string, input: CreateBranchDishRequest) =>
        edit(branchId, (state) => {
          if (
            !state.base.categories.some((each) => each.id === input.categoryId)
          )
            throw httpError(404, "CATEGORY_NOT_FOUND");
          usable(state, input.imageId, "image");
          usable(state, input.videoId, "video");
          const dish: BranchDish = {
            id: fresh(),
            categoryId: input.categoryId,
            name: input.name,
            description: input.description ?? "",
            priceCents: input.priceCents,
            currency: input.currency,
            imageId: input.imageId ?? null,
            videoId: input.videoId ?? null,
            position: input.position ?? 1000,
            available: input.available ?? true,
          };
          state.own.dishes.push(dish);
          return { ...dish };
        }),
    ),
    updateBranchDish: vi.fn(
      async (
        branchId: string,
        dishId: string,
        update: UpdateBranchDishRequest,
      ) =>
        edit(branchId, (state) => {
          if (
            update.categoryId !== undefined &&
            !state.base.categories.some((each) => each.id === update.categoryId)
          )
            throw httpError(404, "CATEGORY_NOT_FOUND");
          usable(state, update.imageId, "image");
          usable(state, update.videoId, "video");
          return { ...Object.assign(ownDish(state, dishId), defined(update)) };
        }),
    ),
    removeBranchDish: vi.fn(async (branchId: string, dishId: string) =>
      edit(branchId, (state) => {
        ownDish(state, dishId);
        state.own.dishes = state.own.dishes.filter(
          (each) => each.id !== dishId,
        );
      }),
    ),
    putBranchProfile: vi.fn(
      async (branchId: string, profile: PutProfileRequest) =>
        edit(branchId, (state) => {
          usable(state, profile.logoId, "image");
          return (state.own.profile = {
            ...profile,
            logoId: profile.logoId ?? null,
          });
        }),
    ),
    removeBranchProfile: vi.fn(async (branchId: string) =>
      edit(branchId, ({ own }) => {
        own.profile = null;
      }),
    ),
    createBranchMedia: vi.fn(
      async (branchId: string, request: CreateMediaRequest) => {
        const { base } = scope(branchId);
        const media: Media = {
          id: fresh(),
          kind: request.kind,
          branchId,
          status: "pending_upload",
          contentType: request.contentType,
          sizeBytes: request.sizeBytes,
          failureReason: null,
          stalled: false,
          image: null,
          video: null,
          createdAt: "2026-11-13T17:00:00.000Z",
        };
        base.media.push(media);
        const upload = {
          url: `https://s3.example.test/originals/${media.id}`,
          method: "PUT" as const,
          headers: { "Content-Type": request.contentType },
          expiresAt: "2099-01-01T00:00:00.000Z",
        };
        return { media: { ...media }, upload };
      },
    ),
    completeBranchMedia: vi.fn(async (branchId: string, mediaId: string) => {
      const { base } = scope(branchId);
      const media = base.media.find(
        (each) => each.id === mediaId && each.branchId === branchId,
      );
      if (media === undefined) throw httpError(404, "NOT_FOUND");
      if (media.status === "failed") throw httpError(409, "MEDIA_FAILED");
      if (media.status === "pending_upload") {
        if (!base.stored.includes(mediaId))
          throw httpError(409, "MEDIA_NOT_UPLOADED");
        media.status = "processing";
      }
      return { ...media };
    }),
    branchMediaProblems: vi.fn(async (branchId: string) => {
      const { base } = scope(branchId);
      const seen = base.media.filter(
        (each) => each.branchId === null || each.branchId === branchId,
      );
      return {
        items: structuredClone(
          seen.filter((each) => each.status === "failed" || each.stalled),
        ),
        nextCursor: null,
      };
    }),
    publishBranchMenu: vi.fn(
      async (
        branchId: string,
        request: PublishBranchMenuRequest,
        key: string,
      ) => {
        const { base, own } = scope(branchId);
        const body = JSON.stringify(request);
        const previous = own.publications.get(key);
        if (previous !== undefined) {
          if (previous.request !== body)
            throw httpError(422, "IDEMPOTENCY_KEY_REUSED");
          return previous.publication;
        }
        if (request.draftVersion !== own.draftVersion)
          throw httpError(409, "DRAFT_CHANGED");
        if (base.publishedVersion === null)
          throw httpError(409, "BASE_MENU_NOT_PUBLISHED");
        const published =
          own.publishedCategories ?? base.categories.map((each) => each.id);
        if (own.dishes.some((dish) => !published.includes(dish.categoryId)))
          throw httpError(409, "CATEGORY_NOT_PUBLISHED");
        const version = (own.publishedVersion ?? 0) + 1;
        const publication: Publication = {
          id: fresh(),
          scope: "branch",
          version,
          publishedAt: "2026-11-13T18:00:00.000Z",
          menus: [{ branchId, version: version + 10 }],
        };
        own.publishedVersion = version;
        own.publications.set(key, { request: body, publication });
        return publication;
      },
    ),
  };
}
