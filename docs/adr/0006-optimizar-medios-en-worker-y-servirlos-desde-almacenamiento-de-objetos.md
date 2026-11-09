# ADR-0006: Optimizar los medios en un worker con ffmpeg y servirlos desde almacenamiento de objetos

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-06

## Contexto

El restaurante sube sus fotos y videos, y el sistema debe optimizarlos al cargarlos (diseño, _Catálogo: publicación y medios_). Guardarlos cuesta poco (~1.9 GB el primer año); servirlos es lo caro: 6.6875 MB por sesión, 1.7 Gbps en pico y ~100 TB al mes, que llegan a 5.2 Gbps y ~300 TB al mes a 3 años (_Escala y supuestos_). Optimizar un video tarda de segundos a minutos.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (capacidad de la API) y fiabilidad.

## Decisión

- Subir un medio guarda el original en el almacenamiento de objetos, responde al recibirlo y encola la optimización.
- Un worker de medios (NestJS + `ffmpeg`) genera las variantes, las guarda en el almacenamiento y marca el Medio como listo o fallido.
- Los medios se sirven directo del almacenamiento al celular, nunca por la API. En producción, detrás de una CDN.
- Mientras un video se optimiza, el platillo se publica con su foto (ver ADR-0015).

## Alternativas consideradas

- Servir los medios desde la API: ~100 TB al mes la saturarían.
- Optimizarlos al pedirlos: CPU y latencia en el camino del comensal.

## Consecuencias

- Positivas: la API no carga con la transferencia y la optimización no bloquea solicitudes.
- Negativas y riesgos aceptados: en producción, costo de transferencia y una CDN por definir.
- Fallas asociadas: si cae el worker, el Medio sigue en "procesando" más de 10 min, el platillo conserva su foto y se avisa al admin; si cae el almacenamiento, el menú muestra skeletons y textos, y los medios vuelven al recuperarse.
- Revisar al elegir la nube y la CDN de producción.
