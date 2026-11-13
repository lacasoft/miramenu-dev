import type {
  BusinessMenuDraft,
  Category,
  CreateCategoryRequest,
  CreateDishRequest,
  Dish,
  Media,
  MediaKind,
  Profile,
  Publication,
  PublicationConflict,
  PublishBusinessMenuRequest,
  PutProfileRequest,
  SessionActor,
  UpdateCategoryRequest,
  UpdateDishRequest,
} from "@miramenu/contracts";
import { vi } from "vitest";
import { httpError, id } from "./fake-admin";
import { accessIn, type World } from "./fake-world";

/** A business's base menu in memory: its draft and what was published. */
export interface MenuState {
  draftVersion: number;
  publishedVersion: number | null;
  profile: Profile | null;
  categories: Category[];
  dishes: Dish[];
  conflicts: PublicationConflict[];
  /** Categories where a branch has its own dishes: they cannot go. */
  usedByBranches: string[];
  /** Each idempotency key with the request it carried and what it published. */
  publications: Map<string, { request: string; publication: Publication }>;
  /** The business's media, in any state. */
  media: Media[];
  /** The media whose file reached storage. */
  stored: string[];
}

export const emptyMenu = (extra: Partial<MenuState> = {}): MenuState => ({
  draftVersion: 0,
  publishedVersion: null,
  profile: null,
  categories: [],
  dishes: [],
  conflicts: [],
  usedByBranches: [],
  publications: new Map(),
  media: [],
  stored: [],
  ...extra,
});

export const categoryOf = (
  n: number,
  name: string,
  position: number,
): Category => ({ id: id(n), name, position });

export const dishOf = (
  n: number,
  categoryId: string,
  name: string,
  priceCents: number,
  position: number,
): Dish => ({
  id: id(n),
  categoryId,
  name,
  description: "",
  priceCents,
  currency: "MXN",
  imageId: null,
  videoId: null,
  position,
});

const LIMITS = { categories: 50, dishes: 300 };
const byOrder = <T extends { position: number; name: string }>(a: T, b: T) =>
  a.position - b.position || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
const nextPosition = (items: readonly { position: number }[]) =>
  items.reduce((last, item) => Math.max(last, item.position + 1), 0);
const defined = <T extends object>(update: T) =>
  Object.fromEntries(
    Object.entries(update).filter(([, value]) => value !== undefined),
  ) as Partial<T>;

let next = 900;
const fresh = () => id((next += 1));

/** The calls of the base menu over a world, as the given person; the API's rules, in memory. */
export function menuApi(world: World, actor: () => SessionActor | null) {
  const { visible, administer, businessAt } = accessIn(world, actor);
  const menuOf = (businessId: string) => {
    businessAt(businessId);
    world.menus ??= {};
    return (world.menus[businessId] ??= emptyMenu());
  };
  /** A change: only the business's admin, and the draft's version goes up when it works. */
  const edit = <T>(businessId: string, work: (menu: MenuState) => T): T => {
    const menu = menuOf(businessId);
    administer(businessId);
    const result = work(menu);
    menu.draftVersion += 1;
    return result;
  };
  const categoryIn = (
    menu: MenuState,
    categoryId: string,
    code = "NOT_FOUND",
  ) => {
    const category = menu.categories.find((each) => each.id === categoryId);
    if (category === undefined) throw httpError(404, code);
    return category;
  };
  /** A medium named in a change: the API's checks (media-refs.ts). */
  const usable = (menu: MenuState, mediaId: string | null | undefined, kind: MediaKind) => {
    if (mediaId === null || mediaId === undefined) return;
    const found = menu.media.find((each) => each.id === mediaId);
    if (found === undefined) throw httpError(404, "MEDIA_NOT_FOUND");
    if (found.kind !== kind) throw httpError(422, "MEDIA_KIND_MISMATCH");
    if (found.status === "pending_upload") throw httpError(409, "MEDIA_NOT_UPLOADED");
    if (found.status === "failed") throw httpError(409, "MEDIA_FAILED");
  };
  const usedMedia = (menu: MenuState) => {
    const ids = new Set([menu.profile?.logoId, ...menu.dishes.flatMap((dish) => [dish.imageId, dish.videoId])]);
    return menu.media.filter((each) => ids.has(each.id));
  };
  const dishIn = (menu: MenuState, dishId: string) => {
    const dish = menu.dishes.find((each) => each.id === dishId);
    if (dish === undefined) throw httpError(404, "NOT_FOUND");
    return dish;
  };

  return {
    menuDraft: vi.fn(async (businessId: string): Promise<BusinessMenuDraft> => {
      const menu = menuOf(businessId);
      visible(businessId);
      return structuredClone({
        draftVersion: menu.draftVersion,
        publishedVersion: menu.publishedVersion,
        profile: menu.profile,
        categories: [...menu.categories].sort(byOrder),
        dishes: [...menu.dishes].sort(byOrder),
        conflicts: menu.conflicts,
        media: usedMedia(menu),
      });
    }),
    putProfile: vi.fn(async (businessId: string, profile: PutProfileRequest) =>
      edit(businessId, (menu) => {
        usable(menu, profile.logoId, "image");
        return (menu.profile = { ...profile, logoId: profile.logoId ?? null });
      }),
    ),
    createCategory: vi.fn(
      async (businessId: string, input: CreateCategoryRequest) =>
        edit(businessId, (menu) => {
          if (menu.categories.length >= LIMITS.categories)
            throw httpError(409, "MENU_LIMIT_REACHED");
          const category = {
            id: fresh(),
            name: input.name,
            position: input.position ?? nextPosition(menu.categories),
          };
          menu.categories.push(category);
          return { ...category };
        }),
    ),
    updateCategory: vi.fn(
      async (
        businessId: string,
        categoryId: string,
        update: UpdateCategoryRequest,
      ) =>
        edit(businessId, (menu) => ({
          ...Object.assign(categoryIn(menu, categoryId), defined(update)),
        })),
    ),
    removeCategory: vi.fn(async (businessId: string, categoryId: string) =>
      edit(businessId, (menu) => {
        categoryIn(menu, categoryId);
        if (
          menu.dishes.some((dish) => dish.categoryId === categoryId) ||
          menu.usedByBranches.includes(categoryId)
        )
          throw httpError(409, "CATEGORY_IN_USE");
        menu.categories = menu.categories.filter(
          (each) => each.id !== categoryId,
        );
      }),
    ),
    createDish: vi.fn(async (businessId: string, input: CreateDishRequest) =>
      edit(businessId, (menu) => {
        if (menu.dishes.length >= LIMITS.dishes)
          throw httpError(409, "MENU_LIMIT_REACHED");
        categoryIn(menu, input.categoryId, "CATEGORY_NOT_FOUND");
        usable(menu, input.imageId, "image");
        usable(menu, input.videoId, "video");
        const siblings = menu.dishes.filter(
          (dish) => dish.categoryId === input.categoryId,
        );
        const dish: Dish = {
          id: fresh(),
          categoryId: input.categoryId,
          name: input.name,
          description: input.description ?? "",
          priceCents: input.priceCents,
          currency: input.currency,
          imageId: input.imageId ?? null,
          videoId: input.videoId ?? null,
          position: input.position ?? nextPosition(siblings),
        };
        menu.dishes.push(dish);
        return { ...dish };
      }),
    ),
    updateDish: vi.fn(
      async (businessId: string, dishId: string, update: UpdateDishRequest) =>
        edit(businessId, (menu) => {
          if (update.categoryId !== undefined)
            categoryIn(menu, update.categoryId, "CATEGORY_NOT_FOUND");
          usable(menu, update.imageId, "image");
          usable(menu, update.videoId, "video");
          return { ...Object.assign(dishIn(menu, dishId), defined(update)) };
        }),
    ),
    removeDish: vi.fn(async (businessId: string, dishId: string) =>
      edit(businessId, (menu) => {
        dishIn(menu, dishId);
        menu.dishes = menu.dishes.filter((each) => each.id !== dishId);
      }),
    ),
    publishBusinessMenu: vi.fn(
      async (
        businessId: string,
        request: PublishBusinessMenuRequest,
        key: string,
      ) => {
        const menu = menuOf(businessId);
        administer(businessId);
        const body = JSON.stringify(request);
        const previous = menu.publications.get(key);
        if (previous !== undefined) {
          if (previous.request !== body)
            throw httpError(422, "IDEMPOTENCY_KEY_REUSED");
          return previous.publication;
        }
        if (request.draftVersion !== menu.draftVersion)
          throw httpError(409, "DRAFT_CHANGED");
        if (menu.profile === null) throw httpError(409, "PROFILE_REQUIRED");
        const confirmed = new Set(
          (request.confirmedConflicts ?? []).map(
            (ref) => `${ref.branchId}:${ref.dishId}`,
          ),
        );
        if (
          menu.conflicts.some(
            (conflict) =>
              !confirmed.has(`${conflict.branchId}:${conflict.dishId}`),
          )
        )
          throw httpError(409, "PUBLICATION_CONFLICTS");
        const version = (menu.publishedVersion ?? 0) + 1;
        const branches = world.branches.filter(
          (branch) => branch.businessId === businessId,
        );
        const publication: Publication = {
          id: fresh(),
          scope: "business",
          version,
          publishedAt: "2026-11-13T18:00:00.000Z",
          menus: branches.map((branch) => ({ branchId: branch.id, version })),
        };
        menu.publishedVersion = version;
        menu.conflicts = [];
        menu.publications.set(key, { request: body, publication });
        return publication;
      },
    ),
  };
}
