import { z } from "zod";

/** Lists use cursors, 20 items by default and 50 at most (design: API y modelo de datos). */
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 50;

/** Opaque to clients: they pass back what the API returned as nextCursor. */
export const cursorSchema = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/);

export const pageQuerySchema = z.strictObject({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGE_SIZE_MAX)
    .default(PAGE_SIZE_DEFAULT),
  cursor: cursorSchema.optional(),
});

export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    items: z.array(item),
    nextCursor: cursorSchema.nullable(),
  });
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
