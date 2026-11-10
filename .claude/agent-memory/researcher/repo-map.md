# Mapa del repo y trampas

Verificado el 2026-11-10 (última revisión: fase 2a, Catálogo, rama `feat/catalog-menu`).

- El diseño vive fuera del repo: `../miramenu/design.md` (system-design-kit, con su propio `.claude/`). La demo de la que sale está en `../menu_experience/design.md`. Antes de reimportar, compara el `updated` del front matter con la línea "Diseño de origen" de `CLAUDE.project.md`.
- `business-access` (fase 1) y `catalog` (fase 2a) están implementados; `diners`, `interactions` y `measurement` siguen vacíos (solo su `*.module.ts` y su `index.ts`), registrados en `apps/api/src/app.module.ts`.
- Mapa de Negocios y acceso (`apps/api/src/modules/business-access/`):
  - `domain/access-policy.ts`: la matriz de permisos pura (404 fuera del alcance, 403 dentro). `application/access-control.ts` la aplica y carga el negocio real de una sucursal.
  - `application/identifiers.ts`: reglas de subdominio y slug (actual + alias, `FOR UPDATE`, `ON CONFLICT DO NOTHING`), el QR y `findOrCreateAdminUser` (columnas explícitas por el permiso de `is_superadmin`).
  - Flujo de login: `http/session.controller.ts` → `application/login.service.ts` (límite en `login-throttle.ts`, Redis) → `admin-session.service.ts` (token, hash, `authenticate` con inactividad).
  - `migrations/1794312000000-CreateBusinessAccessTables.ts`: tablas, índices y los permisos por columna que garantizan RNF-08 y que los QR, subdominios y slugs no se reasignan.
- Mapa de Catálogo (`apps/api/src/modules/catalog/`, ADR-0036):
  - `domain/compose-menu.ts` (combina base publicada + sucursal publicada) y `domain/conflicts.ts` (`findConflicts`, `unconfirmedConflicts`, `overwriteAdjustments`): reglas puras.
  - `application/draft-state.ts`: filas `business_state`/`branch_state`, `draft_version` que cada edición sube primero; usa `BranchDirectory` de Negocios y acceso para saber si un negocio existe.
  - `application/publication.service.ts`: las dos publicaciones (bloqueos, idempotencia, choques, pisar). Las escrituras de versiones están en `publication-records.ts`; las lecturas comunes, en `menu-store.ts`.
  - `application/published-menu.service.ts`: `GET /branches/:id/menu` con `readThrough` e invalidación tras publicar.
  - `migrations/1794400000000-CreateCatalogTables.ts`: tablas, claves foráneas con `business_id` y el `REVOKE` que fija las versiones publicadas.
- Compartido entre contextos en `apps/api/src/infrastructure/`: `database/query.ts` (`selectRows`, `changeRows`, `violatesConstraint`; antes `business-access/application/sql.ts`), `cache/` (`readThrough`, `RedisFailSoftCache`; antes en `business-access/domain/`) y `http/idempotency-key.ts`.
- `apps/api/src/cli/`: `migrations.ts` (la lista única de migraciones), `migrator.data-source.ts` (rol dueño) y `seed-superadmin.ts`. El migrador ya no vive en `infrastructure/database/`.
- Los e2e usan la base `miramenu_test` (global setup la migra). `test/support/admin-fixtures.ts` tiene los atajos (superadmin, `activateAdmin`, `AdminClient` con headers extra, token desde Mailpit) y `test/support/catalog-fixtures.ts` los de Catálogo. Para simular Postgres caído en un e2e: `app.get(getDataSourceToken('catalog')).destroy()` (ver `catalog-recovery.e2e-spec.ts`). Se renombraron del español al glosario de `CLAUDE.project.md` el 2026-11-09 (negocios → business-access, catalogo → catalog, comensales → diners, interacciones → interactions, medicion → measurement). La plantilla (`AppController` "Hello World!") se borró en la fase 0 del backend.
- Mapa de la base del backend (fase 0, 2026-11-09), todo en `apps/api/src/infrastructure/`:
  - `config/environment.ts`: el esquema Zod del entorno; `parseEnvironment` (todo) y `parseDatabaseEnvironment` (solo DB, para el migrador y los tests). `config.module.ts` expone `APP_CONFIG`.
  - `database/`: `database-contexts.ts` (la lista de contextos = nombres de esquema), `context-connection-options.ts` (una conexión por contexto, con su rol y `search_path`) y la migración `1794260948502-CreateContextSchemas.ts`.
  - `http/configure-app.ts`: lo comparten `main.ts` y `test/support/test-app.ts`. `all-exceptions.filter.ts` convierte todo al sobre de `@miramenu/contracts`.
  - `health/health.controller.ts`: `/health/live` (balanceador) y `/health/dependencies` (monitoreo; nombra las dependencias caídas).
- Infra local: `compose.yaml` + `config/postgres/init-roles.sh` (roles y base, solo dev/CI) + `config/seaweedfs/start.sh` (identidades S3) + `scripts/init-dev-env.mjs` (genera `.env`). Puertos: Postgres 55432, Redis 56379, S3 58333, SMTP 51025, Mailpit UI 58025.
- Para revisar el estado de Postgres sin leer el `.env`: `docker compose exec -T postgres psql -U postgres -d miramenu` (el superusuario entra por socket dentro del contenedor).
- `apps/pwa` y `apps/admin` son la plantilla de Vite sin tocar; sus `package.json` solo difieren en `name`. En `packages/` solo están `tokens` e `icons` (sistema visual, traídos de la demo `menu-experience-demo`); su fuente es `docs/diseno-visual/`, donde `dashboard.png` existe solo en local.
- npm workspaces sube casi todo al `node_modules/` de la raíz. Solo quedan locales `typescript` 7.0 en `apps/pwa` y `apps/admin`, y `ts-jest` en `apps/api`. Por eso los scripts `test*` de `apps/api/package.json` apuntan a `../../node_modules/jest/bin/jest.js` (corregido el 2026-11-09; antes apuntaban a `./node_modules/…` y fallaban con `MODULE_NOT_FOUND`).
- `apps/api/tsconfig.json`: `strict: true` pero `strictPropertyInitialization: false`; `module: nodenext` y sin `"type": "module"` en su `package.json` (CommonJS).
- `apps/api/jest.config.ts` arma el `moduleNameMapper` con los `paths` de `tsconfig.json`; `apps/api/test/jest-e2e.json` no: un alias de ruta nuevo rompería solo los e2e.
