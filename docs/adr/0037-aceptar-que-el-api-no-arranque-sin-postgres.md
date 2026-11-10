# ADR-0037: Aceptar que el API no arranque sin Postgres

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la fase 2 (Catálogo); estaba en _Pendiente de confirmar_; acota ADR-0016

## Contexto

ADR-0016 pide servir el menú y la resolución del QR desde la caché de Redis si cae Postgres. Eso funciona cuando Postgres cae **con el API en marcha**: la lectura falla y se sirve la copia guardada. Pero al **arrancar**, TypeORM abre una conexión por contexto, la reintenta 3 veces y, si no la logra, el API no arranca. Por eso una instancia nueva durante una caída de Postgres no sirve nada, aunque Redis tenga todas las copias.

Atributos en juego (ISO/IEC 25010): fiabilidad (disponibilidad, tolerancia a fallas) y mantenibilidad.

## Decisión

- Solo se cubre la caída **en marcha**: el menú y el QR siguen saliendo de la caché, y lo comprueba `test/catalog-recovery.e2e-spec.ts`.
- Que el API **no arranque** sin Postgres queda como riesgo aceptado. Solo afecta a una instancia que se despliega, se reinicia o se agrega mientras Postgres está caído.
- La sonda de vida (`GET /health/live`) no toca dependencias. Así, el orquestador no reemplaza las instancias sanas durante una caída de Postgres, y esas instancias siguen sirviendo desde la caché.

## Alternativas consideradas

- Conexiones diferidas, para que el API arranque sin Postgres y conecte después: cubre el arranque en frío, pero obliga a reescribir cómo se registran las conexiones de TypeORM por contexto y a manejar en cada módulo un estado de "todavía sin base". Es mucho costo para un caso que se evita en la operación.

## Consecuencias

- Positivas: el arranque sigue siendo simple y falla rápido si la configuración de la base está mal.
- Negativas y riesgos aceptados: durante una caída de Postgres no conviene desplegar, reiniciar ni escalar hacia arriba, porque las instancias nuevas no arrancarían.
- Revisar al elegir el orquestador de producción: el autoescalado no debe reemplazar instancias sanas solo porque Postgres no responde.
