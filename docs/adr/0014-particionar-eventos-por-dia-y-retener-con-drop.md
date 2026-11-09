# ADR-0014: Particionar los eventos por día, con clave única (día, eventoId) y retención por DROP

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-14

## Contexto

La tabla Evento llega a ~3,240 M filas a 90 días y ~9,700 M a 3 años (diseño, _Escala y supuestos_). Un índice único global y un borrado diario de 36 M filas generan bloat y vacuum costoso (revisión con IA del 2026-11-09, flujo de medición). RNF-07 fija 90 días para los crudos (ADR-0005).

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (almacenamiento e índices) y mantenibilidad operativa.

## Decisión

- La tabla Evento se particiona por día de `ocurridoEn`, con clave única `(día, eventoId)`.
- La retención borra la partición entera (`DROP`).
- Las particiones se crean por adelantado.
- Evento solo se agrega, nunca se edita.

## Alternativas consideradas

- Una sola tabla con borrado diario: bloat, vacuum costoso e índices que crecen hasta miles de millones de filas.

## Consecuencias

- Positivas: retención barata, sin bloat por borrar 36 M filas al día, e índices acotados por partición.
- Negativas y riesgos aceptados: particiones que crear por adelantado; un evento cuyo día no tiene partición no se puede guardar. La unicidad es por `(día, eventoId)`: un reintento repite el mismo `ocurridoEn` y cae en la misma partición.
- Las particiones se manejan en migraciones SQL escritas a mano (ADR-0025).
