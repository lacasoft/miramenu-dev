import { QueryFailedError } from 'typeorm';

/** The socket to Postgres could not open or was lost: the server is down or unreachable. */
const NETWORK_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

/**
 * SQLSTATEs of a server that is shutting down, starting up or out of connections; the
 * whole class 08 is a connection exception. A query error (syntax, constraint) is not here.
 */
const UNAVAILABLE_SQLSTATES: ReadonlySet<string> = new Set([
  '57P01', // admin_shutdown: Postgres is stopping and ends the session
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now: starting up or shutting down
  '53300', // too_many_connections
]);

/** pg reports a connection lost mid-query, or a pool that cannot connect, only by message. */
const UNAVAILABLE_MESSAGES: ReadonlySet<string> = new Set([
  'Connection terminated unexpectedly',
  'Connection terminated',
  'Connection terminated due to connection timeout',
  'Client has encountered a connection error and is not queryable',
  'timeout exceeded when trying to connect',
]);

const stringField = (value: unknown, field: string): string | undefined => {
  if (typeof value !== 'object' || value === null || !(field in value))
    return undefined;
  const found: unknown = (value as Record<string, unknown>)[field];
  return typeof found === 'string' ? found : undefined;
};

/**
 * True when a failure means Postgres cannot be reached right now, as opposed to a bug or a
 * rejected query: the request may succeed if retried, so it is a 503, not a 500. A network
 * error carries no origin, so one from another dependency also counts: it is as transient.
 */
export function isDatabaseUnavailable(error: unknown): boolean {
  const cause: unknown =
    error instanceof QueryFailedError ? error.driverError : error;
  const code = stringField(cause, 'code');
  if (code !== undefined) {
    return (
      NETWORK_ERROR_CODES.has(code) ||
      UNAVAILABLE_SQLSTATES.has(code) ||
      code.startsWith('08')
    );
  }
  const message = stringField(cause, 'message');
  return message !== undefined && UNAVAILABLE_MESSAGES.has(message);
}
