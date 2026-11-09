# ADR-0009: Construir todo en NestJS, sin Python por ahora

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-09

## Contexto

Python se consideró para la optimización de medios y los cálculos de analítica, solo si fuera realmente necesario (diseño, _Decisiones → Restricciones tecnológicas_). No lo es: la optimización la hace `ffmpeg`, que se invoca igual desde NestJS, y los cálculos son agregaciones que caben en Postgres.

Atributos en juego (ISO/IEC 25010): mantenibilidad (un solo lenguaje).

## Decisión

- Backend y workers en NestJS (TypeScript).
- Python queda para la recomendación de platillos, que está fuera de alcance en esta versión.

## Alternativas consideradas

- Python para medios y analítica: un segundo lenguaje, otra imagen de Docker y más dependencias, sin beneficio hoy.

## Consecuencias

- Positivas: un solo lenguaje, una sola imagen de Docker y menos dependencias.
- Negativas y riesgos aceptados: si llega la recomendación con modelos, habrá que sumar Python.
- Revisar cuando se diseñe la recomendación.
