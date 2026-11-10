# ADR-0041: Medir con un registro por entrada al feed y particiones diarias

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisiones tomadas al planear la fase 5 (Medición); cambia el modelo de eventos del diseño y concreta ADR-0004, ADR-0005, ADR-0011, ADR-0012, ADR-0013, ADR-0014 y ADR-0022

## Contexto

El diseño mide lo que hace el comensal en el feed con unos 6 eventos por entrada a una tarjeta (entrada, vista, exposición, paso rápido, salida), que la PWA manda en lotes a `POST /events/batch`. El worker los guarda contados una sola vez y suma un agregado por hora, que es lo que lee el dashboard. Los crudos se conservan 90 días y los agregados sin límite.

Con la carga del primer año (500 sucursales), eso son unos 36 M de eventos al día y, según el diseño, unos 2.3 TB de crudos a 90 días. Faltaba decidir:

- la granularidad de lo que se guarda;
- dónde vive la regla del paso rápido;
- cómo recibir lo que manda `sendBeacon` al ocultarse la página;
- qué hacer cuando la cola se llena o Redis no responde;
- quién crea y borra las particiones diarias, si el rol de Medición no puede hacer DDL (ADR-0027);
- qué ve cada admin en el dashboard.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (volumen y espacio), fiabilidad (cada entrada cuenta una vez, aunque haya reintentos o caídas) y seguridad (aislamiento entre negocios y retención que el API no puede saltarse).

## Decisión

- **Un registro por entrada al feed (`FeedEntry`)**, no 6 eventos:
  - La PWA lo arma al cerrar la entrada (ADR-0011) con `entryId` (UUID del cliente), `branchId`, `dishId`, `enteredAt`, `exposureMs`, `validView` (70% visible durante 1 s continuo, como en la demo) y `exit` (`manual`, `auto` o `abandoned`).
  - Es inmutable. Son unos 6 M de filas al día en vez de 36 M: 6 veces menos filas y, como una entrada ocupa poco más que un evento, del orden de 6 veces menos espacio.
  - Validación: `validView` exige al menos 1 s de exposición, y la exposición tiene un tope de 10 min.
- **Paso rápido en el servidor:** una salida `manual` con menos de 2 s de exposición. Una salida automática o por abandono nunca cuenta, como dice el diseño. La regla vive en el dominio de Medición, no en la PWA, y una restricción `CHECK` de la tabla la repite.
- **Ingesta:** `POST /feed-entries/batch { deviceId, entries }`, de hasta 100 entradas.
  - Acepta `application/json` y también `text/plain` con JSON: `sendBeacon` no puede mandar headers propios ni JSON a otro origen sin preflight. Por lo mismo, el `deviceId` va en el cuerpo.
  - Responde 202 con un recibo por entrada: `accepted`, o `rejected` con su posición y su motivo (`invalid`, `too_late` si tiene más de 7 días, `in_future` si pasa de 5 min, `repeated_in_batch`).
  - Sin sesión, sin chequeo de `Origin` y sin límite por IP: las entradas no llevan datos del comensal ni cambian el estado de nadie, y un tope por IP frenaría la wifi de un restaurante, como con los likes (ADR-0040).
- **Cola** (ADR-0012): BullMQ `measurement-batches`, un trabajo por lote.
  - Si la cola pasa `MEASUREMENT_QUEUE_MAX_BATCHES` (50,000 por defecto), responde 503 `MEASUREMENT_QUEUE_FULL`; si Redis no responde en 2 s, 503 `MEASUREMENT_UNAVAILABLE`. En los dos casos la PWA conserva el lote (diseño, flujo de medición, paso 3).
  - Cada trabajo tiene 3 intentos con espera exponencial. Uno que falla las 3 veces queda en la lista de fallidos de BullMQ, que es la "cola de errores" del diseño (paso 5), y los demás siguen.
- **Worker** (ADR-0013), una transacción por lote:
  1. descarta las entradas de un platillo que no está en el menú vigente de la sucursal (ADR-0022), con el contrato `MenuDishes` de Catálogo;
  2. `INSERT … ON CONFLICT (entered_at, entry_id) DO NOTHING RETURNING`;
  3. suma solo lo insertado al agregado por hora, ordenado por clave para que dos workers no se bloqueen entre sí.
  - El trabajo se confirma después del commit: una caída antes lo reprocesa sin contar doble.
  - Una entrada tardía suma a su propia hora.
- **Particiones** (ADR-0014):
  - `measurement.feed_entry` se particiona por rango de `entered_at`, un día UTC por partición (`feed_entry_pYYYYMMDD`), con PK `(entered_at, entry_id)`: Postgres exige la clave de partición en la PK, y una entrada reenviada trae el mismo `entered_at`.
  - Las crea y borra `measurement.maintain_feed_entry_partitions()`, una función del dueño de la base, `SECURITY DEFINER`, con `search_path` fijo y **sin parámetros**. Crea los últimos 7 días y los próximos 7, y borra los de más de 90 (ADR-0005). Como el rol de Medición no puede pasarle nada, no puede borrar datos recientes.
  - Solo el rol de Medición tiene `EXECUTE`. La migración la llama una vez, y el worker al arrancar y luego cada hora, sin traslapes.
  - `/health/dependencies` agrega `measurement_partitions`, que falla si no existe la partición de mañana: es la alerta de que el worker no corre.
- **Solo altas:** los permisos por defecto del esquema `measurement` ya no dan `UPDATE` ni `DELETE` al rol de Medición, así que ninguna tabla nueva, partición incluida, los trae. Solo el agregado recibe `UPDATE`.
- **Agregado:** `measurement.hourly_aggregate (branch_id, dish_id, hour)` con `entries`, `views`, `exposure_ms` (solo de las entradas con vista válida, como la demo) y `quick_skips`. Se conserva sin límite.
- **Dashboard:**
  - `GET /admin/branches/:branchId/metrics` con nivel `view`, y `GET /admin/businesses/:businessId/metrics` con nivel `operate`: el admin de sucursal solo ve la suya, como dice el diseño.
  - Parámetros: `from` y `to` en horas exactas (hasta 400 días), y `timeZone` (IANA, `America/Mexico_City` por defecto).
  - Responde los totales con sus tasas (exposición promedio = exposición / vistas; paso rápido = pasos rápidos / entradas; `null` si no hay denominador, nunca 0), la serie por día en esa zona y la tabla por platillo.
  - Los likes y comentarios del período vienen del contrato `InteractionCounts.forPeriod` de Interacciones: los likes por su `created_at` y los comentarios por su `approved_at`.

## Alternativas consideradas

- **Los 6 eventos del diseño:** seis veces más filas y espacio por lo mismo, y la PWA tendría que mandar eventos sueltos de una entrada que todavía no termina. Al cerrar la entrada ya se sabe todo lo que se mide.
- **Calcular el paso rápido en la PWA:** un cliente no confiable decidiría una métrica; además, cambiar el umbral exigiría una versión nueva de la PWA.
- **`deviceId` en un header:** `sendBeacon` no lo permite, y perderíamos justo las entradas que se cierran al ocultarse la página.
- **Particiones creadas por el rol del API o por un job externo con el dueño:** lo primero rompe ADR-0027 (sin DDL); lo segundo necesita otra credencial con más poder y otra pieza que operar.
- **Función con días de retención como parámetro:** quien tenga `EXECUTE` podría pedir borrar todo.
- **`pg_partman` u otra extensión:** resuelve lo mismo, pero agrega una dependencia del servidor de Postgres que la nube elegida tendría que ofrecer.
- **Una ruta de métricas con el alcance como parámetro (`GET /admin/metrics`):** dos rutas con su objeto en la ruta siguen el mismo chequeo de aislamiento que las demás (ADR-0019, ADR-0032).

## Consecuencias

- **Positivas:**
  - Unas 6 veces menos filas y espacio que lo previsto en el diseño.
  - Cada entrada cuenta una vez aunque el lote se reenvíe, el worker caiga o dos workers tomen copias del mismo lote.
  - El rol del API no puede crear ni borrar tablas, ni cambiar o borrar una entrada: la retención solo la aplica la función.
  - El dashboard no copia datos de otros contextos: pide las sucursales a Negocios y acceso y los conteos a Interacciones.
- **Negativas y riesgos aceptados:**
  - El modelo de eventos del diseño cambia: `MeasurementEvent` pasa a `FeedEntry`, y la ruta `POST /events/batch` a `POST /feed-entries/batch`. Hay que actualizar `design.md`.
  - Una entrada que la PWA no alcanza a cerrar ni a guardar en IndexedDB se pierde entera, no solo sus últimos eventos.
  - Las entradas falsas sobre platillos de la propia sucursal siguen siendo un riesgo aceptado, como en el diseño.
  - El tope de la cola se mide en lotes y no en minutos, como supone el diseño (15 min): hay que ajustar `MEASUREMENT_QUEUE_MAX_BATCHES` con el tamaño real de los lotes de la PWA.
  - Si el worker no corre más de 7 días, las entradas nuevas fallan por falta de partición; `/health/dependencies` lo avisa desde el primer día.
  - La exposición promedio solo cuenta las entradas con vista válida: una entrada sin vista suma al paso rápido pero no a la exposición.
