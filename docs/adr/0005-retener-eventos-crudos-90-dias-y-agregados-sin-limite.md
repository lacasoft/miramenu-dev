# ADR-0005: Retener los eventos crudos 90 días y los agregados sin límite

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-05

## Contexto

RNF-07 fija la retención: datos de comensales registrados y agregados de métricas sin límite; eventos crudos de medición, 90 días. El volumen es alto: 36 M eventos al día, 25.2 GB diarios de crudos y 9.2 TB al año sin índices (diseño, _Escala y supuestos_). Los datos de los comensales están por revisar contra la ley mexicana de datos personales.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (capacidad de almacenamiento) y mantenibilidad (poder corregir cálculos).

## Decisión

- Los eventos crudos se conservan 90 días.
- Los agregados por hora se conservan sin límite.

## Alternativas consideradas

- Todo crudo para siempre: crece sin fin (27.6 TB al año a 3 años).
- Solo agregados: un error de cálculo no se podría corregir.

## Consecuencias

- Positivas: el crudo se estabiliza en ~2.3 TB el primer año y ~6.8 TB a 3 años; se pueden corregir cálculos de los últimos 90 días.
- Negativas y riesgos aceptados: una métrica nueva no se puede calcular hacia atrás más de 90 días.
- La forma de aplicar la retención está en ADR-0014.
- Revisar si la ley o el negocio piden otro plazo.
