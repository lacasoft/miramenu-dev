import { z } from "zod";
import { pageSchema } from "./pagination.ts";

/** Names the platform needs for itself; no business can take them as subdomain. */
export const RESERVED_SUBDOMAINS = [
  "admin",
  "api",
  "www",
  "mail",
  "static",
  "cdn",
  "assets",
  "app",
  "q",
] as const;

/** A DNS label of 3 to 63 characters (ADR-0018). */
export const subdomainSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
  .refine(
    (name) => !(RESERVED_SUBDOMAINS as readonly string[]).includes(name),
    "reserved",
  );

/** Branch slug in the URL path when the branch uses its business's subdomain (ADR-0029). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/);

/** Alphabet of QR codes: no 0/o, 1/l/i, so a printed code cannot be misread. */
export const QR_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
export const QR_CODE_LENGTH = 7;
export const qrCodeSchema = z
  .string()
  .regex(new RegExp(`^[${QR_CODE_ALPHABET}]{${QR_CODE_LENGTH}}$`));

export const countrySchema = z.string().regex(/^[A-Z]{2}$/);
export const personNameSchema = z.string().trim().min(1).max(120);
export const businessNameSchema = z.string().trim().min(1).max(120);
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254));

/** 12 to 128 characters, counted as Unicode code points, with no composition rules (ADR-0034). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const passwordSchema = z.string().refine((value) => {
  const length = [...value].length;
  return length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH;
}, "length");

/** 32 random bytes in base64url (sessions and invitations). */
export const secretTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** Roles inside a business. Superadmin is not one of them: it only exists in the seed (RNF-08). */
export const adminRoleSchema = z.enum(["business_admin", "branch_admin"]);
export type AdminRole = z.infer<typeof adminRoleSchema>;

const roleTargetSchema = z
  .strictObject({ role: adminRoleSchema, branchId: z.uuid().optional() })
  .refine(
    (target) =>
      (target.role === "branch_admin") === (target.branchId !== undefined),
    {
      message: "branch_admin needs a branchId and business_admin takes none",
      path: ["branchId"],
    },
  );

// --- Requests ---

export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  // Any length is checked against the stored hash; the cap only bounds the hashing work.
  password: z.string().min(1).max(1024),
});

export const acceptInvitationRequestSchema = z.strictObject({
  token: secretTokenSchema,
  password: passwordSchema,
});

export const createBusinessRequestSchema = z.strictObject({
  name: businessNameSchema,
  country: countrySchema,
  subdomain: subdomainSchema,
  admin: z.strictObject({ email: emailSchema, name: personNameSchema }),
});

export const updateBusinessRequestSchema = z
  .strictObject({
    name: businessNameSchema.optional(),
    subdomain: subdomainSchema.optional(),
  })
  .refine((update) => Object.keys(update).length > 0, "empty update");

export const createBranchRequestSchema = z.strictObject({
  name: businessNameSchema,
  slug: slugSchema,
  subdomain: subdomainSchema.optional(),
});

export const updateBranchRequestSchema = z
  .strictObject({
    name: businessNameSchema.optional(),
    slug: slugSchema.optional(),
    /** null removes the branch's own subdomain; it then uses its business's. */
    subdomain: subdomainSchema.nullable().optional(),
  })
  .refine((update) => Object.keys(update).length > 0, "empty update");

export const inviteUserRequestSchema = z.strictObject({
  email: emailSchema,
  name: personNameSchema,
  role: roleTargetSchema,
});

export const setRolesRequestSchema = z.strictObject({
  roles: z.array(roleTargetSchema).min(1).max(50),
});

export const resolveQuerySchema = z.strictObject({
  subdomain: z.string().regex(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/),
  slug: slugSchema.optional(),
});

// --- Responses ---

const timestamp = z.iso.datetime({ offset: true });

export const roleAssignmentSchema = z.strictObject({
  businessId: z.uuid(),
  branchId: z.uuid().nullable(),
  role: adminRoleSchema,
});

export const sessionActorSchema = z.strictObject({
  user: z.strictObject({ id: z.uuid(), email: z.email(), name: z.string() }),
  isSuperadmin: z.boolean(),
  roles: z.array(roleAssignmentSchema),
});

export const businessSchema = z.strictObject({
  id: z.uuid(),
  name: z.string(),
  country: countrySchema,
  subdomain: z.string(),
  createdAt: timestamp,
});

export const invitationDeliverySchema = z.strictObject({
  /** False when the mail provider failed: the inviter can resend later (design: Cae el proveedor de correo). */
  sent: z.boolean(),
});

export const createdBusinessSchema = z.strictObject({
  business: businessSchema,
  admin: z.strictObject({ id: z.uuid(), email: z.email() }),
  invitation: invitationDeliverySchema.nullable(),
});

export const branchSchema = z.strictObject({
  id: z.uuid(),
  businessId: z.uuid(),
  name: z.string(),
  slug: z.string(),
  subdomain: z.string().nullable(),
  url: z.url(),
  createdAt: timestamp,
});

export const qrLinkSchema = z.strictObject({
  code: qrCodeSchema,
  shortUrl: z.url(),
});

export const businessUserSchema = z.strictObject({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  status: z.enum(["invited", "active"]),
  roles: z.array(roleAssignmentSchema),
});

export const invitedUserSchema = z.strictObject({
  user: businessUserSchema,
  invitation: invitationDeliverySchema.nullable(),
});

export const resolutionSchema = z.strictObject({
  businessId: z.uuid(),
  branchId: z.uuid(),
  canonicalUrl: z.url(),
});

export const businessPageSchema = pageSchema(businessSchema);
export const branchPageSchema = pageSchema(branchSchema);
export const businessUserPageSchema = pageSchema(businessUserSchema);

export type SessionActor = z.infer<typeof sessionActorSchema>;
export type Business = z.infer<typeof businessSchema>;
export type CreatedBusiness = z.infer<typeof createdBusinessSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type QrLink = z.infer<typeof qrLinkSchema>;
export type BusinessUser = z.infer<typeof businessUserSchema>;
export type InvitedUser = z.infer<typeof invitedUserSchema>;
export type Resolution = z.infer<typeof resolutionSchema>;
export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

/** Error codes of the Business & access context, besides the generic ones. */
export const BUSINESS_ACCESS_ERROR_CODES = {
  INVALID_CREDENTIALS: "INVALID_CREDENTIALS",
  LOGIN_UNAVAILABLE: "LOGIN_UNAVAILABLE",
  SUBDOMAIN_TAKEN: "SUBDOMAIN_TAKEN",
  SLUG_TAKEN: "SLUG_TAKEN",
  INVITATION_NOT_FOUND: "INVITATION_NOT_FOUND",
  INVITATION_EXPIRED: "INVITATION_EXPIRED",
  USER_ALREADY_ACTIVE: "USER_ALREADY_ACTIVE",
  BRANCH_NOT_IN_BUSINESS: "BRANCH_NOT_IN_BUSINESS",
} as const;
