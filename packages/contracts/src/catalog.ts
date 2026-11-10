import { z } from "zod";

/**
 * Bounds that keep a menu one small document (design: ~100 KB per menu), so drafts and
 * published menus are read whole instead of paginated.
 */
export const MENU_LIMITS = {
  categoriesPerBusiness: 50,
  dishesPerBusiness: 300,
  dishesPerBranch: 100,
  socialLinks: 8,
  confirmedConflicts: 1000,
} as const;

/** Prices are integers in cents of their currency; the cap is 100,000.00. */
export const PRICE_CENTS_MAX = 10_000_000;
export const priceCentsSchema = z.number().int().min(0).max(PRICE_CENTS_MAX);
/** ISO 4217 code; today every business is in Mexico (MXN), ready for other regions (RNF-06). */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/);
export const positionSchema = z.number().int().min(0).max(10_000);
export const draftVersionSchema = z.number().int().min(0);
const versionSchema = z.number().int().min(1);
const displayNameSchema = z.string().trim().min(1).max(120);
export const dishDescriptionSchema = z.string().trim().max(500);
const timestamp = z.iso.datetime({ offset: true });

/** Updates must change something. */
const nonEmpty = (update: object) => Object.keys(update).length > 0;

export const socialNetworkSchema = z.enum([
  "instagram",
  "facebook",
  "tiktok",
  "x",
  "youtube",
  "whatsapp",
  "website",
]);

export const socialLinkSchema = z.strictObject({
  network: socialNetworkSchema,
  url: z.url({ protocol: /^https$/ }).max(2048),
});

/** The restaurant's profile shown on top of the menu: name and social links (logo in phase 2b). */
export const profileSchema = z.strictObject({
  name: displayNameSchema,
  socialLinks: z.array(socialLinkSchema).max(MENU_LIMITS.socialLinks),
});

// --- Draft: categories and dishes of the base menu ---

export const createCategoryRequestSchema = z.strictObject({
  name: displayNameSchema,
  /** Omitted: after the last category. */
  position: positionSchema.optional(),
});

export const updateCategoryRequestSchema = z
  .strictObject({
    name: displayNameSchema.optional(),
    position: positionSchema.optional(),
  })
  .refine(nonEmpty, "empty update");

export const categorySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  position: positionSchema,
});

const dishFields = {
  categoryId: z.uuid(),
  name: displayNameSchema,
  description: dishDescriptionSchema,
  priceCents: priceCentsSchema,
  currency: currencySchema,
};

export const createDishRequestSchema = z.strictObject({
  ...dishFields,
  description: dishDescriptionSchema.default(""),
  /** Omitted: after the last dish of its category. */
  position: positionSchema.optional(),
});

export const updateDishRequestSchema = z
  .strictObject({
    categoryId: dishFields.categoryId.optional(),
    name: dishFields.name.optional(),
    description: dishFields.description.optional(),
    priceCents: dishFields.priceCents.optional(),
    currency: dishFields.currency.optional(),
    position: positionSchema.optional(),
  })
  .refine(nonEmpty, "empty update");

export const dishSchema = z.strictObject({
  id: z.uuid(),
  ...dishFields,
  description: z.string(),
  position: positionSchema,
});

// --- Draft: what a branch adjusts and adds ---

/** A branch's own dish: it goes in one of its business's categories and has its own availability. */
export const createBranchDishRequestSchema = createDishRequestSchema.extend({
  available: z.boolean().default(true),
});

export const updateBranchDishRequestSchema = z
  .strictObject({
    categoryId: dishFields.categoryId.optional(),
    name: dishFields.name.optional(),
    description: dishFields.description.optional(),
    priceCents: dishFields.priceCents.optional(),
    currency: dishFields.currency.optional(),
    position: positionSchema.optional(),
    available: z.boolean().optional(),
  })
  .refine(nonEmpty, "empty update");

export const branchDishSchema = dishSchema.extend({ available: z.boolean() });

/** A branch's adjustment to a base dish; a null price keeps the base price. */
export const putOverrideRequestSchema = z.strictObject({
  priceCents: priceCentsSchema.nullable(),
  available: z.boolean(),
  hidden: z.boolean(),
});

export const overrideSchema = putOverrideRequestSchema.extend({
  dishId: z.uuid(),
});

// --- Draft documents ---

/**
 * A base change that would overwrite a branch's adjustment (ADR-0036): the base price of a
 * dish the branch re-priced changed, or a dish the branch adjusted was removed.
 */
export const conflictReasonSchema = z.enum(["price_changed", "dish_removed"]);

export const conflictRefSchema = z.strictObject({
  branchId: z.uuid(),
  dishId: z.uuid(),
});

export const publicationConflictSchema = conflictRefSchema.extend({
  reason: conflictReasonSchema,
});

export const businessMenuDraftSchema = z.strictObject({
  draftVersion: draftVersionSchema,
  /** Latest published version of the base menu; null before the first publication. */
  publishedVersion: versionSchema.nullable(),
  profile: profileSchema.nullable(),
  categories: z.array(categorySchema),
  dishes: z.array(dishSchema),
  /** What publishing this draft would overwrite; publishing needs them confirmed. */
  conflicts: z.array(publicationConflictSchema),
});

export const branchMenuDraftSchema = z.strictObject({
  draftVersion: draftVersionSchema,
  publishedVersion: versionSchema.nullable(),
  /** The branch's own profile; null uses its business's. */
  profile: profileSchema.nullable(),
  overrides: z.array(overrideSchema),
  dishes: z.array(branchDishSchema),
});

// --- Publication ---

/** Header of every publication; a retry with the same key returns the first result. */
export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

export const publishBusinessMenuRequestSchema = z.strictObject({
  /** The draft version the admin reviewed; a newer draft is refused (DRAFT_CHANGED). */
  draftVersion: draftVersionSchema,
  /** Every current conflict, as the admin saw it; each confirmed adjustment is overwritten. */
  confirmedConflicts: z
    .array(conflictRefSchema)
    .max(MENU_LIMITS.confirmedConflicts)
    .default([]),
});

export const publishBranchMenuRequestSchema = z.strictObject({
  draftVersion: draftVersionSchema,
});

export const publicationSchema = z.strictObject({
  id: z.uuid(),
  scope: z.enum(["business", "branch"]),
  /** New version of the base menu (business) or of the branch's adjustments (branch). */
  version: versionSchema,
  publishedAt: timestamp,
  /** The published menu each affected branch now serves. */
  menus: z.array(
    z.strictObject({ branchId: z.uuid(), version: versionSchema }),
  ),
});

// --- Published menu, the only thing diners read (ADR-0003) ---

export const menuDishSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  priceCents: priceCentsSchema,
  currency: currencySchema,
  available: z.boolean(),
});

export const menuCategorySchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  dishes: z.array(menuDishSchema).min(1),
});

export const publishedMenuSchema = z.strictObject({
  branchId: z.uuid(),
  version: versionSchema,
  publishedAt: timestamp,
  profile: profileSchema,
  categories: z.array(menuCategorySchema),
});

export type Profile = z.infer<typeof profileSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Dish = z.infer<typeof dishSchema>;
export type BranchDish = z.infer<typeof branchDishSchema>;
export type Override = z.infer<typeof overrideSchema>;
export type ConflictRef = z.infer<typeof conflictRefSchema>;
export type PublicationConflict = z.infer<typeof publicationConflictSchema>;
export type BusinessMenuDraft = z.infer<typeof businessMenuDraftSchema>;
export type BranchMenuDraft = z.infer<typeof branchMenuDraftSchema>;
export type Publication = z.infer<typeof publicationSchema>;
export type MenuDish = z.infer<typeof menuDishSchema>;
export type MenuCategory = z.infer<typeof menuCategorySchema>;
export type PublishedMenu = z.infer<typeof publishedMenuSchema>;

/** Error codes of the Catalog context, besides the generic ones. */
export const CATALOG_ERROR_CODES = {
  /** The draft changed after the admin reviewed it (design: flujo publicar, paso 3). */
  DRAFT_CHANGED: "DRAFT_CHANGED",
  /** Publishing would overwrite branch adjustments the admin has not confirmed. */
  PUBLICATION_CONFLICTS: "PUBLICATION_CONFLICTS",
  /** The idempotency key was already used for a different publication request. */
  IDEMPOTENCY_KEY_REUSED: "IDEMPOTENCY_KEY_REUSED",
  /** The business has no profile yet; the menu needs its name. */
  PROFILE_REQUIRED: "PROFILE_REQUIRED",
  /** A branch publishes before its business published a base menu. */
  BASE_MENU_NOT_PUBLISHED: "BASE_MENU_NOT_PUBLISHED",
  /** A branch's own dish is in a category its business has not published yet. */
  CATEGORY_NOT_PUBLISHED: "CATEGORY_NOT_PUBLISHED",
  CATEGORY_NOT_FOUND: "CATEGORY_NOT_FOUND",
  CATEGORY_IN_USE: "CATEGORY_IN_USE",
  MENU_LIMIT_REACHED: "MENU_LIMIT_REACHED",
} as const;
