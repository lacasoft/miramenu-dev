/** Quotes a Postgres identifier (schema, role, table) for statements that cannot take parameters. */
export function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
