# Mapa del repo y trampas

Verificado el 2026-11-09 (última revisión: base del backend, rama `feat/backend-foundation`).

- El diseño vive fuera del repo: `../miramenu/design.md` (system-design-kit, con su propio `.claude/`). La demo de la que sale está en `../menu_experience/design.md`. Antes de reimportar, compara el `updated` del front matter con la línea "Diseño de origen" de `CLAUDE.project.md`.
- Los cinco módulos de `apps/api/src/modules/` siguen vacíos (solo su `*.module.ts` y su `index.ts`), registrados en `apps/api/src/app.module.ts`. Se renombraron del español al glosario de `CLAUDE.project.md` el 2026-11-09 (negocios → business-access, catalogo → catalog, comensales → diners, interacciones → interactions, medicion → measurement). La plantilla (`AppController` "Hello World!") se borró en la fase 0 del backend.
- Mapa de la base del backend (fase 0, 2026-11-09), todo en `apps/api/src/infrastructure/`:
  - `config/environment.ts`: el esquema Zod del entorno; `parseEnvironment` (todo) y `parseDatabaseEnvironment` (solo DB, para el migrador y los tests). `config.module.ts` expone `APP_CONFIG`.
  - `database/`: `database-contexts.ts` (la lista de contextos = nombres de esquema), `context-connection-options.ts` (una conexión por contexto, con su rol y `search_path`), `migrator.data-source.ts` (lo usa el CLI de TypeORM desde `dist/`) y la migración `1794260948502-CreateContextSchemas.ts`.
  - `http/configure-app.ts`: lo comparten `main.ts` y `test/support/test-app.ts`. `all-exceptions.filter.ts` convierte todo al sobre de `@miramenu/contracts`.
  - `health/health.controller.ts`: `/health/live` (balanceador) y `/health/dependencies` (monitoreo; nombra las dependencias caídas).
- Infra local: `compose.yaml` + `config/postgres/init-roles.sh` (roles y base, solo dev/CI) + `config/seaweedfs/start.sh` (identidades S3) + `scripts/init-dev-env.mjs` (genera `.env`). Puertos: Postgres 55432, Redis 56379, S3 58333, SMTP 51025, Mailpit UI 58025.
- Para revisar el estado de Postgres sin leer el `.env`: `docker compose exec -T postgres psql -U postgres -d miramenu` (el superusuario entra por socket dentro del contenedor).
- `apps/pwa` y `apps/admin` son la plantilla de Vite sin tocar; sus `package.json` solo difieren en `name`. En `packages/` solo están `tokens` e `icons` (sistema visual, traídos de la demo `menu-experience-demo`); su fuente es `docs/diseno-visual/`, donde `dashboard.png` existe solo en local.
- npm workspaces sube casi todo al `node_modules/` de la raíz. Solo quedan locales `typescript` 7.0 en `apps/pwa` y `apps/admin`, y `ts-jest` en `apps/api`. Por eso los scripts `test*` de `apps/api/package.json` apuntan a `../../node_modules/jest/bin/jest.js` (corregido el 2026-11-09; antes apuntaban a `./node_modules/…` y fallaban con `MODULE_NOT_FOUND`).
- `apps/api/tsconfig.json`: `strict: true` pero `strictPropertyInitialization: false`; `module: nodenext` y sin `"type": "module"` en su `package.json` (CommonJS).
- `apps/api/jest.config.ts` arma el `moduleNameMapper` con los `paths` de `tsconfig.json`; `apps/api/test/jest-e2e.json` no: un alias de ruta nuevo rompería solo los e2e.
