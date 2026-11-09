# ADR-0002: Usar React con apps separadas para el comensal y el admin

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-02

## Contexto

El comensal abre el menú desde un QR en su celular, con RNF-01: primera tarjeta utilizable en ≤3 s en al menos 18 de 20 aperturas frías, con 10 Mbps y RTT de ~100 ms. La persona quiere un camino hacia una app nativa con React Native y descartó Angular (diseño, _Decisiones → Restricciones tecnológicas_). El admin (CMS, publicación, moderación y dashboard) es otra audiencia, con mucho más código.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (tiempo de carga) y flexibilidad (paso a nativo).

## Decisión

- Frontend en React.
- Dos apps separadas en el monorepo: `apps/pwa` (PWA del comensal) y `apps/admin` (app de admin). El menú nunca carga código del admin.

## Alternativas consideradas

- Angular: no ofrece el camino a React Native.
- Una sola app para comensal y admin: el bundle del comensal arrastraría código del admin y pondría en riesgo RNF-01.

## Consecuencias

- Positivas: camino hacia React Native; bundle del comensal sin código del admin.
- Negativas y riesgos aceptados: dos apps que construir y publicar; en React Native las pantallas se rehacen (la lógica se reutiliza según ADR-0024).
- Revisar cuando se decida construir la app nativa.
