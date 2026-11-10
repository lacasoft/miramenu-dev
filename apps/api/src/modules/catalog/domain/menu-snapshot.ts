import type {
  MenuCategory,
  MenuImage,
  MenuProfile,
  MenuVideo,
  Profile,
} from '@miramenu/contracts';

export interface SnapshotCategory {
  id: string;
  name: string;
  position: number;
}

export interface SnapshotDish {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  position: number;
  imageId: string | null;
  videoId: string | null;
}

export interface SnapshotBranchDish extends SnapshotDish {
  available: boolean;
}

export interface SnapshotOverride {
  dishId: string;
  /** null keeps the base price. */
  priceCents: number | null;
  available: boolean;
  hidden: boolean;
}

/** What the business published: its categories, base dishes and profile (ADR-0036). */
export interface BaseSnapshot {
  profile: Profile;
  categories: SnapshotCategory[];
  dishes: SnapshotDish[];
}

/** What a branch published: its adjustments, own dishes and, optionally, its own profile. */
export interface BranchSnapshot {
  profile: Profile | null;
  overrides: SnapshotOverride[];
  dishes: SnapshotBranchDish[];
}

/** The combined menu of one branch, as diners read it (ADR-0003). */
export interface MenuContent {
  profile: MenuProfile;
  categories: MenuCategory[];
}

/**
 * What combining a menu knows of each medium it references (ADR-0015): a ready one is
 * resolved to its URLs; a pending one (not uploaded or still processing) is left out and
 * remembered, so a later version shows it; a failed one is just left out.
 */
export type MediaState =
  | { status: 'ready'; kind: 'image'; image: MenuImage }
  | { status: 'ready'; kind: 'video'; video: MenuVideo }
  | { status: 'pending' }
  | { status: 'failed' };

export type MediaStates = ReadonlyMap<string, MediaState>;

export const EMPTY_BRANCH_SNAPSHOT: BranchSnapshot = {
  profile: null,
  overrides: [],
  dishes: [],
};
