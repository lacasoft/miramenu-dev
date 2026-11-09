# ADR-0012: Mantener la cola de medición en Redis con AOF cada segundo, noeviction y un tope

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-12

## Contexto

La cola de medición (ADR-0004) vivía en un Redis efímero, compartido con la caché del menú y los códigos de validación. Si cae Postgres, el worker no guarda y la cola crece ~1.6 MB/s (~5.8 GB/h): puede llenar la memoria y tumbar la caché y el registro (revisión con IA del 2026-11-09, flujo de medición). Los lotes ya aceptados no deberían perderse.

Atributos en juego (ISO/IEC 25010): fiabilidad (tolerancia a fallas) y eficiencia de desempeño (memoria).

## Decisión

- Redis con AOF cada segundo (`appendfsync everysec`) y `maxmemory-policy noeviction`.
- La cola tiene un tope de 15 min de eventos (supuesto): ~1.4 GB el primer año y ~4.3 GB a 3 años. Por encima del tope, Medición rechaza el lote y la PWA lo conserva.
- Si Redis no responde al encolar, el lote se rechaza y la PWA reintenta.

## Alternativas consideradas

- Redis efímero: un reinicio pierde lotes ya aceptados.
- Un Redis aparte para la cola: otra pieza que operar.

## Consecuencias

- Positivas: la medición no tumba el menú ni el registro, y no se pierden lotes aceptados, salvo ~1 s.
- Negativas y riesgos aceptados: hasta ~1 s de pérdida posible y escritura continua a disco (~1.6 MB/s). Con `noeviction`, Redis no expulsa claves al llenarse sino que rechaza escrituras, así que toda clave de caché, límite o código necesita vencimiento.
- Falla asociada: Redis se reinicia con lotes aceptados → recupera la cola del AOF y reanuda donde iba.
- Revisar si la cola llega a necesitar un Redis propio.
