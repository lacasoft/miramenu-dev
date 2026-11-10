import { z } from "zod";
import { pageQuerySchema, pageSchema } from "./pagination.ts";

/** design: "Fija el estado (activo: true o false), así que repetirlo no duplica". */
export const likeRequestSchema = z.strictObject({ active: z.boolean() });

export const likeStateSchema = z.strictObject({
  active: z.boolean(),
  /** Likes of the dish in this branch, this one included. */
  likes: z.number().int().nonnegative(),
});

/** Counts per dish of a branch; a dish with no likes nor approved comments is absent. */
export const branchInteractionsSchema = z.strictObject({
  dishes: z.array(
    z.strictObject({
      dishId: z.uuid(),
      likes: z.number().int().nonnegative(),
      comments: z.number().int().nonnegative(),
    }),
  ),
});

export const myLikesSchema = z.strictObject({ dishIds: z.array(z.uuid()) });

export const COMMENT_MAX_LENGTH = 280;
export const commentTextSchema = z
  .string()
  .trim()
  .min(1)
  .refine((text) => [...text].length <= COMMENT_MAX_LENGTH, "too long")
  // Line breaks are fine; other control characters are not.
  .refine((text) => !/[\u0000-\u0009\u000B-\u001F\u007F-\u009F]/.test(text), "control characters");

export const createCommentSchema = z.strictObject({
  branchId: z.uuid(),
  dishId: z.uuid(),
  text: commentTextSchema,
  /** Chosen by the client, so a retry after a timeout never posts twice (design). */
  clientId: z.uuid(),
});

export const editCommentSchema = z.strictObject({ text: commentTextSchema });

export const commentStatusSchema = z.enum(["pending", "approved", "rejected"]);

const authorSchema = z.strictObject({ name: z.string() });

/** What everyone sees: only approved comments, and only the author's name (ADR-0007). */
export const publicCommentSchema = z.strictObject({
  id: z.uuid(),
  text: z.string(),
  author: authorSchema,
  approvedAt: z.iso.datetime(),
});

/** What the author sees of their own comments, whatever their state. */
export const ownCommentSchema = z.strictObject({
  id: z.uuid(),
  branchId: z.uuid(),
  dishId: z.uuid(),
  text: z.string(),
  status: commentStatusSchema,
  version: z.number().int().positive(),
  submittedAt: z.iso.datetime(),
});

/** A comment waiting for a moderator; overdue after COMMENT_OVERDUE_HOURS (design: 24 h). */
export const moderationItemSchema = z.strictObject({
  id: z.uuid(),
  branchId: z.uuid(),
  dishId: z.uuid(),
  text: z.string(),
  author: authorSchema,
  version: z.number().int().positive(),
  submittedAt: z.iso.datetime(),
  overdue: z.boolean(),
});

export const moderationQuerySchema = pageQuerySchema.extend({
  /** Only the comments waiting longer than the overdue threshold. */
  overdue: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
});

/** The version the moderator read: an edit or another moderator in between makes it 409. */
export const moderateCommentSchema = z.strictObject({
  version: z.number().int().positive(),
});

export const publicCommentPageSchema = pageSchema(publicCommentSchema);
export const ownCommentPageSchema = pageSchema(ownCommentSchema);
export const moderationPageSchema = pageSchema(moderationItemSchema).extend({
  /** How many pending comments of this scope are overdue: the admin's notice. */
  overdueCount: z.number().int().nonnegative(),
});

export type LikeState = z.infer<typeof likeStateSchema>;
export type BranchInteractions = z.infer<typeof branchInteractionsSchema>;
export type MyLikes = z.infer<typeof myLikesSchema>;
export type PublicComment = z.infer<typeof publicCommentSchema>;
export type OwnComment = z.infer<typeof ownCommentSchema>;
export type ModerationItem = z.infer<typeof moderationItemSchema>;
export type ModerationPage = z.infer<typeof moderationPageSchema>;

/** Error codes of the Interactions context, besides the generic ones. */
export const INTERACTIONS_ERROR_CODES = {
  /** The dish is not on the branch's published menu (or is hidden there). */
  DISH_NOT_ON_MENU: "DISH_NOT_ON_MENU",
  /** The comment was edited or moderated after the moderator read it. */
  COMMENT_CHANGED: "COMMENT_CHANGED",
  /** The client id was already used for a different comment. */
  CLIENT_ID_REUSED: "CLIENT_ID_REUSED",
} as const;
