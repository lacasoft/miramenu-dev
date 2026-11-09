# ADR-0004: Procesar la medición con una cola y un worker, con agregados por hora

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-04

## Contexto

La medición domina las escrituras: ~2,300 eventos/s en pico (32.4 sesiones/s × 72 eventos) y ~7,000 a 3 años, en ~1,200 solicitudes de lotes por segundo, frente a 65 likes/s (diseño, _Escala y supuestos → Tráfico_). RNF-04 admite hasta 30 s de retraso en el dashboard. RNF-01 (abrir el menú) y RNF-02 (respuesta a un toque) no deben degradarse por la medición.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño y fiabilidad bajo carga.

## Decisión

- El módulo Medición acepta lotes de eventos, los encola en Redis y responde enseguida.
- Un worker de medición (NestJS) guarda los eventos y suma al agregado por hora `(sucursalId, platilloId, hora)` que lee el dashboard, por sucursal o agrupado por negocio.

## Alternativas consideradas

- Guardar cada evento desde la API al recibirlo: un pico de medición competiría con el menú y los likes por conexiones y CPU.

## Consecuencias

- Positivas: un pico de medición no frena el menú ni los likes.
- Negativas y riesgos aceptados: hasta 30 s de retraso en el dashboard y una pieza más que operar.
- Fallas asociadas (_Flujo: medición_): el worker cae a mitad de un lote → otro lo reprocesa sin contar doble (ADR-0013); un lote que falla 3 veces se aparta a una cola de errores y el resto sigue; en un pico la cola crece más rápido de lo que se procesa → se suman workers, vigilando el tamaño de la cola y la antigüedad del evento más viejo.
- Revisar si la medición llega a necesitar un almacén analítico propio.
