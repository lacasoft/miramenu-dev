# ADR-0024: Separar la lógica del frontend en paquetes compartidos sin DOM

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-24

## Contexto

La persona quiere poder evolucionar a React Native (ADR-0002) y que la PWA y el admin compartan el cliente de la API y los tipos (diseño, _Decisiones → Restricciones tecnológicas_). La PWA usa APIs propias del navegador para la medición: IndexedDB, `sendBeacon` y `visibilitychange` (ADR-0011).

Atributos en juego (ISO/IEC 25010): mantenibilidad (reutilización) y flexibilidad (portabilidad).

## Decisión

- Estado, llamadas a la API, reglas de la PWA y tipos viven en paquetes compartidos sin DOM, en `packages/`. Las apps solo pintan.
- Lo que depende del navegador (IndexedDB, `sendBeacon`, `visibilitychange`) va detrás de una interfaz, con una implementación por plataforma.

## Alternativas consideradas

- Lógica dentro de los componentes de cada app: pasar a React Native obligaría a reescribirla y la PWA y el admin duplicarían el cliente de la API.

## Consecuencias

- Positivas: pasar a React Native rehace solo las pantallas; la PWA y el admin comparten el cliente de la API y los tipos.
- Negativas y riesgos aceptados: una capa más que diseñar, y adaptadores por plataforma para IndexedDB, `sendBeacon` y `visibilitychange`.
- El límite (paquetes sin DOM, apps sin lógica) solo se sostiene si una regla automática lo comprueba.
