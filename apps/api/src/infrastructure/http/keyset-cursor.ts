import { z } from 'zod';
import { RequestValidationException } from './request-validation';

/**
 * Position after the last item of a page, for lists ordered by (created_at DESC, id DESC).
 * created_at columns keep millisecond precision, so a JavaScript Date round-trips exactly
 * and no row is skipped between pages.
 */
export interface KeysetPosition {
  createdAt: Date;
  id: string;
}

const positionSchema = z.tuple([z.iso.datetime({ offset: true }), z.uuid()]);

export function encodeCursor(position: KeysetPosition): string {
  return Buffer.from(
    JSON.stringify([position.createdAt.toISOString(), position.id]),
  ).toString('base64url');
}

/** Decodes a cursor the API issued; anything else is a validation error on "cursor". */
export function decodeCursor(cursor: string): KeysetPosition {
  try {
    const [createdAt, id] = positionSchema.parse(
      JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')),
    );
    return { createdAt: new Date(createdAt), id };
  } catch {
    throw new RequestValidationException(['cursor']);
  }
}

/** Builds a page from limit + 1 rows: the extra row only says whether another page exists. */
export function toPage<T extends KeysetPosition, R>(
  rows: readonly T[],
  limit: number,
  map: (row: T) => R,
): { items: R[]; nextCursor: string | null } {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items: items.map(map),
    nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
  };
}
