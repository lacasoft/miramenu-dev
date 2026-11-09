# Sistema visual de Miramenu

Viene de la demo `menu-experience-demo` (carpeta `diseño/`, commit `faa79db` del 2026-11-03). Es el
**Sistema de diseño gastronómico v1.0**: una especificación, no una biblioteca de componentes.

| Archivo                                                                      | Qué es                                                                                                                                                    | Estado                                                                                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `sistema-de-diseno-gastronomico-v1.0.md`                                     | La especificación completa: principios, color por rol, tipografía, geometría, materiales, iconos, retículas, detalle, movimiento, estados y accesibilidad | Referencia vigente                                                                                                               |
| `aprobadas/feed.png`, `dos-columnas.png`, `tres-columnas.png`, `detalle.png` | Las cuatro pantallas aprobadas del comensal                                                                                                               | **Aprobadas**: no se reinterpretan                                                                                               |
| `GUIA-VISUAL.png`                                                            | Muestra de fundamentos y componentes                                                                                                                      | Referencia; no sustituye a las pantallas aprobadas                                                                               |
| `dashboard.png`                                                              | Referencia del dashboard                                                                                                                                  | Solo **composición**, no contenido (ver `.claude/rules/design-system.md`). Es de terceros: no se versiona y existe solo en local |

## Dónde viven los valores

- **Tokens:** `packages/tokens/src/index.ts` es la fuente única. El CSS para la web
  (`packages/tokens/generated/tokens.css`) se genera con `npm run build -w packages/tokens`; no se
  edita a mano. React Native usará el mismo objeto.
- **Iconos:** `packages/icons/src/index.ts` guarda la geometría (viewBox 24 × 24). Cada plataforma
  la dibuja con su renderer.
- **Reglas para el agente:** `.claude/rules/design-system.md`, que se carga al trabajar en
  `apps/pwa/`, `apps/admin/` y `packages/`.

## Lo que la especificación nombra y no existe

La especificación menciona `tokens/tokens.json`, `tokens/build_tokens.py`, `web/icons.svg` y
`documentacion/componentes-y-patrones.md`. **Ninguno se entregó.** Los valores de `packages/tokens`
salen de la regla de la demo (colores verificados contra los píxeles de la guía) y de su
`apps/web/src/styles/globals.css`; la geometría de `packages/icons`, de su `src/components/icons.tsx`.
