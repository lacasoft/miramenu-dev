import type { MenuCategory, Profile } from '@miramenu/contracts';

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
  profile: Profile;
  categories: MenuCategory[];
}

export const EMPTY_BRANCH_SNAPSHOT: BranchSnapshot = {
  profile: null,
  overrides: [],
  dishes: [],
};
