# ADR-0011: Cerrar la entrada como abandono al ocultarse la página, enviar con sendBeacon y guardar lo pendiente en IndexedDB

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-11

## Contexto

Las vistas, la exposición y el paso rápido deben medirse a partir de lo que hace la gente (diseño, _Requisitos → Métricas_). Al bloquear el celular, cambiar de app o cerrar la pestaña, la última entrada del feed se perdía o inflaba su exposición (revisión con IA del 2026-11-09, flujo de medición).

## Decisión

- La salida de una entrada puede ser manual, automática o abandono. Una entrada que termina porque la página se oculta es abandono: su duración llega hasta que se oculta y no cuenta como paso rápido.
- Al ocultarse la página (`visibilitychange` o `pagehide`), la PWA cierra la entrada abierta y envía el lote pendiente con `sendBeacon`.
- Los eventos aún sin confirmar se guardan en IndexedDB y se reenvían al reabrir. El endpoint de lotes acepta los envíos de `sendBeacon`.
- Esas APIs del navegador quedan detrás de una interfaz por plataforma (ADR-0024).

## Alternativas consideradas

- Aceptar la pérdida de la última entrada: sesgo sistemático en la última entrada de cada sesión.

## Consecuencias

- Positivas: métricas sin sesgo en la última entrada de cada sesión.
- Negativas y riesgos aceptados: eventos tardíos rutinarios; el resultado de un envío con `sendBeacon` es desconocido hasta el siguiente envío, por lo que el servidor descarta duplicados por eventoId (ADR-0013) y acepta eventos con hasta 7 días de retraso (supuesto).
