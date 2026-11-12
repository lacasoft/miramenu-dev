# ADR-0042: Probar el frontend con `node --test` en los paquetes y Vitest en las apps

- Estado: Aceptado
- Fecha: 2026-11-12
- Decisores: creador de Miramenu
- Fuente: plan de la fase 6 (PWA del comensal), aprobado el 2026-11-12; cierra "Runner de tests del frontend" de _Pendiente de confirmar_

## Contexto

La baseline pide tests para toda funcionalidad nueva y cobertura en las líneas nuevas. Hasta la fase 5, la PWA, el admin, `tokens` e `icons` no tenían cómo correr tests.

ADR-0024 pone la lógica del frontend en paquetes sin DOM y deja a las apps solo pintar. Eso da dos tipos de prueba:

- reglas puras en los paquetes, sin navegador;
- componentes de React en las apps, que necesitan un DOM.

`packages/contracts` ya prueba con `node --test` y el TypeScript nativo de Node 26, sin dependencias. La demo (`menu-experience-demo`) probó sus pantallas con Vitest y Testing Library sobre Vite 8.

Atributos en juego (ISO/IEC 25010): mantenibilidad (capacidad de prueba) y seguridad de la cadena de suministro (cada dependencia nueva es superficie de ataque).

## Decisión

- **Paquetes sin DOM** (`api-client`, `i18n`, `diner-core` y los que vengan):
  - `node --test "src/**/*.test.ts"`, como `contracts`, sin dependencias;
  - `tsconfig.test.json` aparte con los tipos de Node, para que el código del paquete siga sin ellos.
- **Apps** (`apps/pwa`; `apps/admin` en la fase 7):
  - **Vitest 4.1.12 + Testing Library** (`@testing-library/react` 16.3.3, `@testing-library/dom` 10.4.2) sobre **jsdom 29.1.1**, las versiones que usó la demo;
  - la configuración de Vitest vive en el mismo `vite.config.ts`;
  - las pruebas usan consultas accesibles (`getByRole`, `getByLabelText`) y un cliente falso del API, nunca la red.
- **Dependencias:** se instalaron sin scripts y con `--before`, para que ninguna versión resuelta tuviera menos de 7 días (§6.1). Las 73 transitivas cumplen y ninguna tiene scripts de instalación.
- **CI:** la raíz ya corre `npm test` y `lint` en todos los workspaces, así que el CI no cambia.

## Alternativas consideradas

- **Vitest también en los paquetes:** una sola herramienta, pero mete una dependencia donde `node --test` alcanza y rompe la simetría con `contracts`.
- **Vitest 5.1.0:** más nuevo y también acepta Vite 8. Lo descartamos porque tenía 9 días y la demo ya probó la 4 con este stack.
- **happy-dom en vez de jsdom:** más rápido, pero menos fiel al navegador. jsdom ya estaba probado en la demo.
- **Playwright para recorridos completos:** descarga navegadores y es otra pieza que operar. Por ahora, el recorrido real se comprueba con el Chrome instalado (`google-chrome --headless --dump-dom`) al cerrar cada parte.

## Consecuencias

- **Positivas:**
  - Las reglas puras se prueban sin dependencias y en milisegundos.
  - Las pantallas, con lo que ve el usuario.
  - El CI no cambia.
- **Negativas y riesgos aceptados:**
  - Dos herramientas de test en el frontend.
  - jsdom no reproduce el layout, el video ni `IntersectionObserver`. El feed (6b) y la medición (6d) tendrán que aislar esa lógica en reglas puras y comprobar el resto en Chrome.
  - Todavía no hay umbral de cobertura (HB-01).
