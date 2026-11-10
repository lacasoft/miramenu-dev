import { QueryFailedError, type EntityManager } from 'typeorm';

/** Runs a SELECT or an INSERT ... RETURNING and gives back its rows; never an UPDATE or DELETE. */
export async function selectRows<T>(
  manager: EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  return (await manager.query(sql, parameters)) as T[];
}

/**
 * Runs an UPDATE or DELETE ... RETURNING and gives back the returned rows. TypeORM answers
 * those with [rows, affected count] on Postgres, so selectRows would hand back that pair.
 */
export async function returningRows<T>(
  manager: EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  const [rows] = (await manager.query(sql, parameters)) as [T[], number];
  return rows;
}

/** Runs an UPDATE or DELETE; TypeORM returns [rows, affected count] for those on Postgres. */
export async function changeRows(
  manager: EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<number> {
  const [, affected] = (await manager.query(sql, parameters)) as [
    unknown[],
    number,
  ];
  return affected;
}

/** True when Postgres rejected a write because of the named unique or primary key. */
export function violatesConstraint(
  error: unknown,
  constraint: string,
): boolean {
  const driverError: unknown =
    error instanceof QueryFailedError ? error.driverError : error;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === '23505' &&
    'constraint' in driverError &&
    driverError.constraint === constraint
  );
}
