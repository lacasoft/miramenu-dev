# Mapa del repo y trampas

Verificado el 2026-11-09 sobre el commit `96e142c`.

- El diseño vive fuera del repo: `../miramenu/design.md` (system-design-kit, con su propio `.claude/`). La demo de la que sale está en `../menu_experience/design.md`. Antes de reimportar, compara el `updated` del front matter con la línea "Diseño de origen" de `CLAUDE.project.md`.
- `apps/api` es la plantilla de Nest 12: `AppController` responde "Hello World!" (`apps/api/src/app.controller.ts`) y los cinco módulos de `apps/api/src/modules/` están vacíos, con nombre en español, registrados en `apps/api/src/app.module.ts:11`. Se decidió renombrarlos a inglés según el glosario de `CLAUDE.project.md`.
- `apps/pwa` y `apps/admin` son la plantilla de Vite sin tocar; sus `package.json` solo difieren en `name`. En `packages/` solo están `tokens` e `icons` (sistema visual, traídos de la demo `menu-experience-demo`); su fuente es `docs/diseno-visual/`, donde `dashboard.png` existe solo en local.
- npm workspaces sube casi todo al `node_modules/` de la raíz. Solo quedan locales `typescript` 7.0 en `apps/pwa` y `apps/admin`, y `ts-jest` en `apps/api`. Por eso los scripts `test*` de `apps/api/package.json`, que apuntan a `./node_modules/jest/bin/jest.js`, fallan con `MODULE_NOT_FOUND`.
- `apps/api/tsconfig.json`: `strict: true` pero `strictPropertyInitialization: false`; `module: nodenext` y sin `"type": "module"` en su `package.json` (CommonJS).
- `apps/api/jest.config.ts` arma el `moduleNameMapper` con los `paths` de `tsconfig.json`; `apps/api/test/jest-e2e.json` no: un alias de ruta nuevo rompería solo los e2e.
