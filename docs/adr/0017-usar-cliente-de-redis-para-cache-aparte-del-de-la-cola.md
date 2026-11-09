# ADR-0017: Usar un cliente de Redis para la caché, aparte del de la cola

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-17

## Contexto

La cola de trabajos necesita reintentos; la caché del menú no debe frenar su apertura (RNF-01). Con un solo cliente con reintentos y cola de comandos, un Redis lento hace esperar cada lectura del menú (revisión con IA del 2026-11-09, caché del menú).

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (tiempo de respuesta) y fiabilidad.

## Decisión

- Dos clientes de Redis.
- El de la caché espera ~100 ms (supuesto), sin cola de comandos ni reintentos: si Redis no responde a tiempo, se lee de Postgres.
- El de la cola conserva sus reintentos.

## Alternativas consideradas

- Un solo cliente con reintentos: un Redis lento frena la apertura del menú.

## Consecuencias

- Positivas: un Redis lento no frena la apertura del menú.
- Negativas y riesgos aceptados: durante el problema, todas las lecturas del menú van a Postgres (~32/s en pico).
