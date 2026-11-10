import { CreateContextSchemas1794260948502 } from '../infrastructure/database/migrations/1794260948502-CreateContextSchemas';
import { CreateBusinessAccessTables1794312000000 } from '../modules/business-access/migrations/1794312000000-CreateBusinessAccessTables';
import { CreateCatalogTables1794400000000 } from '../modules/catalog/migrations/1794400000000-CreateCatalogTables';
import { AddCatalogMedia1794500000000 } from '../modules/catalog/migrations/1794500000000-AddCatalogMedia';

/**
 * Every migration, in the order they were written. The migration CLI and the e2e tests
 * both run this list; migrations.spec.ts fails if a migration file is missing from it.
 */
export const MIGRATIONS = [
  CreateContextSchemas1794260948502,
  CreateBusinessAccessTables1794312000000,
  CreateCatalogTables1794400000000,
  AddCatalogMedia1794500000000,
];
