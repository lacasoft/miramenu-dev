# ADR-0022: Descartar en el worker los eventos cuyo platillo no está en el menú de esa sucursal

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-22

## Contexto

Los eventos de medición los arma el celular, y llegan con la sucursal y el platillo que decide el cliente: cualquiera podría mezclar platillos de otro negocio en un dashboard (revisión con IA del 2026-11-09, aislamiento entre negocios). En juego: RNF-05 y la confiabilidad de las métricas.

Atributos en juego (ISO/IEC 25010): seguridad (integridad) y adecuación funcional (corrección de las métricas).

## Decisión

- El worker de medición valida cada evento con el contrato de Catálogo "Confirmar que un platillo está en una sucursal" y descarta los que no están en el menú vigente de esa sucursal.

## Alternativas consideradas

- Aceptar la sucursal y el platillo como los manda el celular.

## Consecuencias

- Positivas: nadie mezcla platillos de otro negocio en un dashboard.
- Negativas y riesgos aceptados: una consulta a Catálogo por lote, que conviene guardar en caché. Se compara con el menú vigente, así que un evento tardío de un platillo ya quitado se descarta. No impide eventos falsos sobre los platillos de la propia sucursal.
