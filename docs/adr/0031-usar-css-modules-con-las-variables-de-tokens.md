# ADR-0031: Usar CSS Modules con las variables de @miramenu/tokens como base de estilos

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear el primer flujo; estaba "por definir" en `.claude/rules/design-system.md`

## Contexto

Las apps (PWA y admin) necesitan una base de estilos para construir los componentes del sistema visual. Los valores ya viven en `packages/tokens`, que genera `tokens.css` con variables CSS. La regla del sistema visual pedía no introducir la base de la demo (Tailwind v4, radix-ui y cva) hasta decidir. La regla del kit para React asume Tailwind y shadcn/ui.

## Decisión

- Los estilos de las apps se escriben con **CSS Modules** (`*.module.css`), que Vite soporta sin dependencias.
- Los módulos consumen las variables de `@miramenu/tokens/tokens.css` por rol (color, tipografía, espacio, radio, movimiento); nunca un valor suelto.
- React Native, cuando llegue, usa el mismo objeto de tokens desde TypeScript, no el CSS.

## Alternativas consideradas

- Tailwind v4 con los tokens como tema: una dependencia y una capa de configuración más, sin una necesidad que no cubran los CSS Modules.

## Consecuencias

- Positivas: cero dependencias nuevas, estilos aislados por componente y una sola fuente de valores.
- Negativas y riesgos aceptados: las utilidades de diseño se escriben a mano, y la regla del kit sobre Tailwind y shadcn/ui no aplica a este repo.
