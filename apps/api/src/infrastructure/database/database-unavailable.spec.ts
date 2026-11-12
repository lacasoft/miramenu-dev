import { DatabaseError } from 'pg';
import { QueryFailedError } from 'typeorm';
import { isDatabaseUnavailable } from './database-unavailable';

/** An error as the pg server reports it, with its SQLSTATE. */
function serverError(code: string, message = 'server error'): DatabaseError {
  const error = new DatabaseError(message, message.length, 'error');
  error.code = code;
  return error;
}

const queryFailed = (driverError: Error) =>
  new QueryFailedError('SELECT 1', [], driverError);

const networkError = (code: string) =>
  Object.assign(new Error(`connect ${code} 127.0.0.1:5432`), { code });

describe('isDatabaseUnavailable', () => {
  // The shapes observed against a real Postgres behind a relay that was cut (2026-11-12).
  it('recognizes a connection the pool could not open', () => {
    expect(isDatabaseUnavailable(networkError('ECONNREFUSED'))).toBe(true);
    expect(isDatabaseUnavailable(networkError('ETIMEDOUT'))).toBe(true);
    expect(isDatabaseUnavailable(networkError('ENOTFOUND'))).toBe(true);
  });

  it('recognizes a connection lost in the middle of a query', () => {
    expect(
      isDatabaseUnavailable(
        queryFailed(new Error('Connection terminated unexpectedly')),
      ),
    ).toBe(true);
    expect(
      isDatabaseUnavailable(
        new Error('timeout exceeded when trying to connect'),
      ),
    ).toBe(true);
  });

  it('recognizes a server that is stopping, starting or full', () => {
    expect(
      isDatabaseUnavailable(
        queryFailed(
          serverError(
            '57P01',
            'terminating connection due to administrator command',
          ),
        ),
      ),
    ).toBe(true);
    expect(isDatabaseUnavailable(queryFailed(serverError('57P03')))).toBe(true);
    expect(isDatabaseUnavailable(queryFailed(serverError('53300')))).toBe(true);
    expect(isDatabaseUnavailable(queryFailed(serverError('08006')))).toBe(true);
  });

  it('leaves a rejected query or a bug as an internal error', () => {
    expect(isDatabaseUnavailable(queryFailed(serverError('23505')))).toBe(
      false,
    );
    expect(isDatabaseUnavailable(queryFailed(serverError('42P01')))).toBe(
      false,
    );
    expect(isDatabaseUnavailable(queryFailed(serverError('42501')))).toBe(
      false,
    );
    expect(isDatabaseUnavailable(new TypeError('x is undefined'))).toBe(false);
    expect(
      isDatabaseUnavailable(new Error('Connection terminated unexpectedly!')),
    ).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
    expect(isDatabaseUnavailable('ECONNREFUSED')).toBe(false);
  });
});
