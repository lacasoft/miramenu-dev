import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';

// Accept a caller's id only if it is short and plain, so it is safe to echo and to log.
const ACCEPTED_REQUEST_ID = /^[A-Za-z0-9._-]{8,128}$/;

export function resolveRequestId(
  incoming: string | string[] | undefined,
): string {
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  return candidate !== undefined && ACCEPTED_REQUEST_ID.test(candidate)
    ? candidate
    : randomUUID();
}

/** Gives every request an id, echoes it in the response and keeps it for the error envelope. */
export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const requestId = resolveRequestId(request.headers['x-request-id']);
  response.locals.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function requestIdOf(response: Response): string {
  const requestId: unknown = response.locals.requestId;
  return typeof requestId === 'string' ? requestId : randomUUID();
}
