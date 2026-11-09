// Genera generated/tokens.css (el adaptador web) desde src/index.ts, la fuente única.
// Uso: node scripts/build-css.mjs          → escribe el archivo
//      node scripts/build-css.mjs --check  → falla si el archivo no está al día
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../src/index.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'generated', 'tokens.css');

const rem = (px) => `${px / 16}rem`;
const kebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const fontStack = (fonts) => fonts.map((f) => (f.includes(' ') ? `'${f}'` : f)).join(', ');
const gradient = (direction, stops) =>
  `linear-gradient(${direction}, ${stops.map((s) => `${s.color} ${s.at * 100}%`).join(', ')})`;

function render(t) {
  const vars = [];
  for (const [k, v] of Object.entries(t.menuColors)) vars.push(`--color-${kebab(k)}: ${v};`);
  for (const [k, v] of Object.entries(t.dashboardColors)) vars.push(`--dashboard-${kebab(k)}: ${v};`);
  vars.push(`--font-sans: ${fontStack(t.fontFamily.sans)};`);
  for (const [k, v] of Object.entries(t.typeScale)) {
    vars.push(`--text-${kebab(k)}: ${rem(v.size)};`, `--text-${kebab(k)}-line-height: ${rem(v.lineHeight)};`);
  }
  for (const s of t.space) vars.push(`--space-${s}: ${rem(s)};`);
  vars.push(
    `--mobile-margin: ${rem(t.layout.mobileMargin)};`,
    `--touch-target: ${t.layout.touchTarget}px;`,
    `--focus-ring-width: ${t.layout.focusRingWidth}px;`,
    `--focus-ring-offset: ${t.layout.focusRingOffset}px;`,
  );
  for (const [k, v] of Object.entries(t.radius)) vars.push(`--radius-${kebab(k)}: ${k === 'pill' ? `${v}px` : rem(v)};`);
  vars.push(
    `--duration-brief: ${t.motion.brief}ms;`,
    `--duration-standard: ${t.motion.standard}ms;`,
    `--duration-editorial: ${t.motion.editorial}ms;`,
    `--ease-standard: ${t.motion.easing};`,
  );
  for (const [k, m] of Object.entries(t.materials)) {
    vars.push(`--${kebab(k)}-background: ${m.background};`, `--${kebab(k)}-border: ${m.border};`, `--${kebab(k)}-blur: ${m.blur}px;`);
  }

  const glass = (name) => `.${name} {
  border: 1px solid var(--${name}-border);
  background-color: var(--${name}-background);
  -webkit-backdrop-filter: blur(var(--${name}-blur));
  backdrop-filter: blur(var(--${name}-blur));
}`;

  return `/* Generado por packages/tokens/scripts/build-css.mjs desde src/index.ts. No lo edites a mano. */

:root {
${vars.map((v) => `  ${v}`).join('\n')}
}

/* Materiales: siempre con alternativa sólida. */
${glass('glass-smoke')}

${glass('glass-pearl')}

@media (prefers-reduced-transparency: reduce) {
  .glass-smoke,
  .glass-pearl {
    background-color: var(--color-surface);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-smoke,
  .glass-pearl {
    background-color: var(--color-surface);
  }
}

.scrim-bottom {
  background-image: ${gradient('to top', t.scrims.bottom)};
}

.scrim-top {
  background-image: ${gradient('to bottom', t.scrims.top)};
}

/* Dashboard: superficies sólidas y su propio foco. */
.dashboard {
  --color-ring: var(--dashboard-ring);
  background-color: var(--dashboard-background);
  color: var(--dashboard-ink);
  color-scheme: light;
}

.dashboard-accent {
  background-image: linear-gradient(135deg, var(--dashboard-accent-from), var(--dashboard-accent-to));
  color: var(--dashboard-accent-foreground);
}
`;
}

const css = render(tokens);

if (process.argv.includes('--check')) {
  const current = existsSync(outFile) ? readFileSync(outFile, 'utf8') : '';
  if (current !== css) {
    console.error('generated/tokens.css no está al día con src/index.ts. Corre: npm run build -w packages/tokens');
    process.exit(1);
  }
  console.log('generated/tokens.css está al día.');
} else {
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, css);
  console.log(`Escrito ${outFile}`);
}
