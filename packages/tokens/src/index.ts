/**
 * Fuente única de los tokens de Miramenu (Sistema de diseño gastronómico v1.0).
 *
 * Valores de la demo `menu-experience-demo`: su `.claude/rules/design-system.md` (colores
 * verificados contra los píxeles de la guía) y su `apps/web/src/styles/globals.css`.
 * Las medidas van en unidades lógicas: px en web, dp en React Native.
 *
 * No edites el CSS generado: cambia este archivo y corre `npm run build -w packages/tokens`.
 * Ver `docs/diseno-visual/` y `.claude/rules/design-system.md`.
 */

/** Paleta base. Los componentes no la usan directo: consumen los roles de abajo. */
export const palette = {
  ink: '#0B0D0C',
  ivory: '#F8F5EF',
  champagne: '#D7C49A',
  accentInk: '#544622',
  mineral: '#EEEDE7',
  spotLight: '#8DD6CD',
  white: '#FFFFFF',
} as const;

/** Roles de color de la experiencia pública (PWA del comensal). */
export const menuColors = {
  background: palette.ink,
  foreground: palette.ivory,
  surface: '#151816',
  mutedForeground: '#D9D3C7',
  danger: '#FFB4A8',
  primary: palette.accentInk,
  primaryForeground: palette.ivory,
  accent: palette.champagne,
  accentForeground: palette.ink,
  ring: palette.champagne,
  /** Señal de atención localizada y opcional; no sustituye al foco. */
  spotLight: palette.spotLight,
} as const;

/** Roles de color del dashboard (app de admin): superficies sólidas, sin cristal. */
export const dashboardColors = {
  background: palette.mineral,
  card: palette.white,
  ink: '#193127',
  muted: '#4F5B55',
  grid: '#E4E6E2',
  /** Tarjeta de acento: degradado diagonal; texto blanco de 5.08:1 a 7.57:1. */
  accentFrom: '#577564',
  accentTo: '#3F5A4B',
  accentForeground: palette.white,
  gaugeTrack: '#E8EFEC',
  positive: '#E8EDEB',
  positiveText: '#29332E',
  negative: '#F8EBEB',
  negativeText: '#4C1006',
  ring: '#193127',
} as const;

export const fontFamily = {
  sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
} as const;

/** Tamaño e interlineado. Lo esencial no baja de 14; el cuerpo largo usa 16. */
export const typeScale = {
  display: { size: 36, lineHeight: 42 },
  screenTitle: { size: 28, lineHeight: 34 },
  section: { size: 22, lineHeight: 28 },
  card: { size: 18, lineHeight: 24 },
  body: { size: 16, lineHeight: 24 },
  label: { size: 14, lineHeight: 20 },
  meta: { size: 12, lineHeight: 16 },
} as const;

/** Escala de espacio en múltiplos de 4. */
export const space = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64] as const;

export const layout = {
  /** Margen móvil de referencia. */
  mobileMargin: 16,
  /** Objetivo táctil: lo aporta el componente interactivo, no el dibujo del icono. */
  touchTarget: 48,
  focusRingWidth: 2,
  focusRingOffset: 2,
} as const;

/** Radios por función. No todo es cápsula. */
export const radius = {
  field: 12,
  module: 24,
  panel: 32,
  pill: 9999,
} as const;

/** Duraciones de animación, no retardos: el feedback empieza en ≤100 ms (RNF-02). */
export const motion = {
  brief: 120,
  /** La especificación da 180–240 ms; la demo usó 200. */
  standard: 200,
  editorial: 320,
  easing: 'ease-out',
} as const;

/**
 * Materiales sobre imagen. El tinte mantiene el texto marfil a 4.5:1 o más incluso sobre un
 * fotograma blanco. Siempre con alternativa sólida (`fallback`) si hay transparencia reducida,
 * soporte insuficiente o rendimiento degradado.
 */
export const materials = {
  /** Cristal ahumado funcional: navegación, selector y barras de acción. */
  glassSmoke: {
    background: 'rgba(22, 23, 20, 0.64)',
    border: 'rgba(248, 245, 239, 0.28)',
    blur: 14,
    fallback: menuColors.surface,
  },
  /** Cristal editorial perla: módulos informativos sobre imagen. */
  glassPearl: {
    background: 'rgba(70, 58, 44, 0.74)',
    border: 'rgba(215, 196, 154, 0.4)',
    blur: 14,
    fallback: menuColors.surface,
  },
} as const;

/** Degradados que dan respaldo al texto breve sobre el video. `at` va de 0 a 1. */
export const scrims = {
  bottom: [
    { color: 'rgba(11, 13, 12, 0.92)', at: 0 },
    { color: 'rgba(11, 13, 12, 0.78)', at: 0.4 },
    { color: 'rgba(11, 13, 12, 0.25)', at: 0.7 },
    { color: 'rgba(11, 13, 12, 0)', at: 1 },
  ],
  top: [
    { color: 'rgba(11, 13, 12, 0.7)', at: 0 },
    { color: 'rgba(11, 13, 12, 0)', at: 1 },
  ],
} as const;

export const tokens = {
  palette,
  menuColors,
  dashboardColors,
  fontFamily,
  typeScale,
  space,
  layout,
  radius,
  motion,
  materials,
  scrims,
} as const;

export type Tokens = typeof tokens;
