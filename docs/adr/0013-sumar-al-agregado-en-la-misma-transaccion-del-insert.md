# ADR-0013: Sumar al agregado en la misma transacción que inserta los eventos sin duplicados

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-13

## Contexto

El resultado esperado del flujo de medición es un agregado por hora con cada evento contado una sola vez (diseño, _Escenarios de falla → Flujo: medición_). Descartar duplicados en los crudos no basta: si el agregado se calcula aparte, un reintento o dos workers en paralelo pueden contar un evento dos veces (revisión con IA del 2026-11-09, flujo de medición).

Atributos en juego (ISO/IEC 25010): adecuación funcional (corrección de las métricas) y fiabilidad.

## Decisión

- El worker procesa cada lote en una transacción: inserta los eventos descartando los duplicados por eventoId y suma al Agregado `(sucursalId, platilloId, hora)` solo los que insertó.
- El lote se confirma en la cola después del commit; si el worker cae antes, otro lo reprocesa sin contar doble.
- Un evento tardío suma a su propia hora por el mismo camino.

## Alternativas consideradas

- Recalcular la hora desde los crudos: carreras entre workers y recálculos costosos con ~2,300 eventos/s en pico.

## Consecuencias

- Positivas: cada evento contado una vez y sin carreras entre workers. Evidencia comprobable: el agregado de una hora coincide con la suma de sus crudos.
- Negativas y riesgos aceptados: cambiar la definición de una métrica exige recalcular desde los crudos, y solo es posible dentro de los 90 días que se conservan (ADR-0005).
