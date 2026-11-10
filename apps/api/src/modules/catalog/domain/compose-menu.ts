import type {
  MenuCategory,
  MenuDish,
  MenuImage,
  MenuVideo,
  Profile,
} from '@miramenu/contracts';
import type {
  BaseSnapshot,
  BranchSnapshot,
  MediaStates,
  MenuContent,
  SnapshotDish,
} from './menu-snapshot';

interface Placed {
  categoryId: string;
  position: number;
  dish: MenuDish;
}

export interface ComposedMenu {
  content: MenuContent;
  /** Media the menu references that are not ready yet (ADR-0015), sorted. */
  pendingMedia: string[];
}

/** Deterministic order, independent of the server's locale: position, then name, then id. */
function byPlacement(
  a: { position: number; name: string; id: string },
  b: { position: number; name: string; id: string },
): number {
  if (a.position !== b.position) return a.position - b.position;
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** Resolves only ready media of the right kind, and remembers the ones still pending. */
class MediaResolver {
  readonly pending = new Set<string>();

  constructor(private readonly states: MediaStates) {}

  image(id: string | null): MenuImage | null {
    const state = this.stateOf(id);
    return state?.status === 'ready' && state.kind === 'image'
      ? state.image
      : null;
  }

  video(id: string | null): MenuVideo | null {
    const state = this.stateOf(id);
    return state?.status === 'ready' && state.kind === 'video'
      ? state.video
      : null;
  }

  private stateOf(id: string | null) {
    if (id === null) return undefined;
    const state = this.states.get(id);
    if (state?.status === 'pending') this.pending.add(id);
    return state;
  }
}

function menuDish(
  dish: SnapshotDish,
  priceCents: number,
  available: boolean,
  media: MediaResolver,
): MenuDish {
  return {
    id: dish.id,
    name: dish.name,
    description: dish.description,
    priceCents,
    currency: dish.currency,
    available,
    image: media.image(dish.imageId),
    video: media.video(dish.videoId),
  };
}

function placeDishes(
  base: BaseSnapshot,
  branch: BranchSnapshot,
  media: MediaResolver,
): Placed[] {
  const overrides = new Map(
    branch.overrides.map((override) => [override.dishId, override]),
  );
  const categoryIds = new Set(base.categories.map((category) => category.id));
  const placed: Placed[] = [];
  for (const dish of base.dishes) {
    const override = overrides.get(dish.id);
    if (override?.hidden) continue;
    placed.push({
      categoryId: dish.categoryId,
      position: dish.position,
      dish: menuDish(
        dish,
        override?.priceCents ?? dish.priceCents,
        override?.available ?? true,
        media,
      ),
    });
  }
  for (const dish of branch.dishes) {
    if (!categoryIds.has(dish.categoryId)) continue;
    placed.push({
      categoryId: dish.categoryId,
      position: dish.position,
      dish: menuDish(dish, dish.priceCents, dish.available, media),
    });
  }
  return placed;
}

/**
 * Combines what the business published with what the branch published (ADR-0003, ADR-0036).
 * Only published snapshots come in, so no draft can reach a diner. Hidden dishes are left
 * out, unavailable ones stay marked, a branch price replaces the base price, and empty
 * categories are omitted. Own dishes whose category the business has not published are
 * left out too; publishing the branch refuses them first (CATEGORY_NOT_PUBLISHED). Media
 * appear only once ready; the pending ones are returned so a later version can add them.
 */
export function composeMenu(
  base: BaseSnapshot,
  branch: BranchSnapshot,
  mediaStates: MediaStates,
): ComposedMenu {
  const media = new MediaResolver(mediaStates);
  const dishesByCategory = new Map<string, Placed[]>();
  for (const entry of placeDishes(base, branch, media)) {
    const list = dishesByCategory.get(entry.categoryId) ?? [];
    list.push(entry);
    dishesByCategory.set(entry.categoryId, list);
  }

  const categories: MenuCategory[] = [...base.categories]
    .sort(byPlacement)
    .flatMap((category) => {
      const dishes = (dishesByCategory.get(category.id) ?? [])
        .sort((a, b) =>
          byPlacement(
            { position: a.position, name: a.dish.name, id: a.dish.id },
            { position: b.position, name: b.dish.name, id: b.dish.id },
          ),
        )
        .map((entry) => entry.dish);
      return dishes.length > 0
        ? [{ id: category.id, name: category.name, dishes }]
        : [];
    });

  const profile: Profile = branch.profile ?? base.profile;
  return {
    content: {
      profile: {
        name: profile.name,
        socialLinks: profile.socialLinks,
        logo: media.image(profile.logoId),
      },
      categories,
    },
    pendingMedia: [...media.pending].sort(),
  };
}

/** Every medium a pair of snapshots references, so the caller loads their states at once. */
export function referencedMedia(
  base: BaseSnapshot,
  branch: BranchSnapshot,
): string[] {
  const ids = new Set<string>();
  for (const dish of [...base.dishes, ...branch.dishes]) {
    if (dish.imageId) ids.add(dish.imageId);
    if (dish.videoId) ids.add(dish.videoId);
  }
  for (const profile of [base.profile, branch.profile]) {
    if (profile?.logoId) ids.add(profile.logoId);
  }
  return [...ids].sort();
}
