import { QueryFailedError, type EntityManager } from 'typeorm';

/** Runs a SELECT, or an INSERT/UPDATE ... RETURNING read as rows, with bound parameters. */
export async function selectRows<T>(
  manager: EntityManager,
  sql: string,
  parameters: unknown[] = [],
): Promise<T[]> {
  return (await manager.query(sql, parameters)) as T[];
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
