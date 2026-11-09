/**
 * Bounded contexts that own data, each with its own Postgres schema and role
 * (ADR-0027). The schema name is the context name.
 */
export const DATABASE_CONTEXTS = [
  'business_access',
  'catalog',
  'diners',
  'interactions',
  'measurement',
] as const;

export type DatabaseContext = (typeof DATABASE_CONTEXTS)[number];
