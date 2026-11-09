/**
 * Geometría canónica de los iconos de Miramenu (Sistema de diseño gastronómico v1.0).
 *
 * Solo datos, sin DOM ni React: cada plataforma los dibuja con su renderer (SVG en la web,
 * react-native-svg en nativo). Viene de `apps/web/src/components/icons.tsx` de la demo.
 *
 * Todos se dibujan en un viewBox de 24 × 24, con trazo `currentColor` de 1.6, extremos y uniones
 * redondeados. El área táctil de 48 la aporta el componente interactivo, no el dibujo.
 */

export const iconDefaults = {
  viewBox: '0 0 24 24',
  size: 24,
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export type IconShape =
  | { readonly kind: 'path'; readonly d: string; readonly strokeWidth?: number }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly rx: number;
    }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number };

export interface IconDefinition {
  /** Relleno fijo con `currentColor` (además del trazo). Sin él, el icono no tiene relleno. */
  readonly filled?: true;
  /** Se rellena como estado (por ejemplo, el corazón cuando ya tiene Me gusta). */
  readonly fillable?: true;
  readonly shapes: readonly IconShape[];
}

const path = (d: string, strokeWidth?: number): IconShape =>
  strokeWidth === undefined ? { kind: 'path', d } : { kind: 'path', d, strokeWidth };

const rect = (x: number, y: number, width: number, height: number, rx: number): IconShape => ({
  kind: 'rect',
  x,
  y,
  width,
  height,
  rx,
});

const threeColumnCells: IconShape[] = [4, 10, 16].flatMap((y) => [4, 10, 16].map((x) => rect(x, y, 4, 4, 1)));

export const icons = {
  /** Me gusta. Se rellena cuando el comensal ya dio like. */
  heart: {
    fillable: true,
    shapes: [path('M12 20.5s-8-4.7-8-10.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8 2.9c0 5.9-8 10.6-8 10.6Z')],
  },
  comment: {
    shapes: [path('M12 4c4.6 0 8 3 8 7s-3.4 7-8 7c-.9 0-1.8-.1-2.6-.3L5 20l.8-4A6.6 6.6 0 0 1 4 11c0-4 3.4-7 8-7Z')],
  },
  close: { shapes: [path('m6 6 12 12M18 6 6 18')] },
  chevronRight: { shapes: [path('m9 5 7 7-7 7')] },
  chevronLeft: { shapes: [path('m15 5-7 7 7 7')] },
  chevronUp: { shapes: [path('m5 15 7-7 7 7')] },
  chevronDown: { shapes: [path('m5 9 7 7 7-7')] },
  play: { filled: true, shapes: [path('M8 5.5v13l10.5-6.5L8 5.5Z')] },
  pause: { shapes: [path('M9 5.5v13M15 5.5v13', 2.4)] },
  soundOn: { shapes: [path('M4 9.5v5h3.5L12 18.5v-13l-4.5 4H4ZM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11')] },
  soundOff: { shapes: [path('M4 9.5v5h3.5L12 18.5v-13l-4.5 4H4ZM16 9.5l5 5M21 9.5l-5 5')] },
  /** Selector de densidad: rectángulo vertical, cuatro celdas y nueve celdas, sin números. */
  densityFeed: { shapes: [rect(7, 3.5, 10, 17, 2)] },
  densityTwoColumns: {
    shapes: [rect(4, 4, 7, 7, 1.5), rect(13, 4, 7, 7, 1.5), rect(4, 13, 7, 7, 1.5), rect(13, 13, 7, 7, 1.5)],
  },
  densityThreeColumns: { shapes: threeColumnCells },
  search: { shapes: [{ kind: 'circle', cx: 11, cy: 11, r: 6.5 }, path('m20 20-4.4-4.4')] },
  summary: {
    shapes: [rect(4, 4, 7, 7, 2), rect(13, 4, 7, 7, 2), rect(4, 13, 7, 7, 2), rect(13, 13, 7, 7, 2)],
  },
  ranking: { shapes: [path('M6 20v-7M12 20V5M18 20v-10', 2.4)] },
  breakdown: {
    shapes: [path('M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5Z'), path('M15.5 3.8a8.5 8.5 0 0 1 4.7 4.7h-4.7V3.8Z')],
  },
  table: { shapes: [rect(4, 5, 16, 14, 2), path('M4 10h16M4 14.5h16M10 10v9')] },
  logout: { shapes: [path('M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l4 4-4 4M19 12H9')] },
  arrowUp: { shapes: [path('M12 19V6M6.5 11.5 12 6l5.5 5.5')] },
  arrowDown: { shapes: [path('M12 5v13M6.5 12.5 12 18l5.5-5.5')] },
} as const satisfies Record<string, IconDefinition>;

export type IconName = keyof typeof icons;
