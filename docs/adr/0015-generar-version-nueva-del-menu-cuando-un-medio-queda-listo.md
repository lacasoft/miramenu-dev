# ADR-0015: Generar una versión nueva del MenúPublicado cuando un Medio queda listo

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-15

## Contexto

Si un video sigue optimizándose, el platillo se puede publicar con su foto; al terminar, el video la reemplaza solo, sin volver a publicar (diseño, _Catálogo: publicación y medios_). Un menú que apunta al Medio y cambia sin cambiar de versión rompe "cacheable por versión": quien guardó una versión no ve el video (revisión con IA del 2026-11-09, caché del menú).

Atributos en juego (ISO/IEC 25010): adecuación funcional y fiabilidad (consistencia de la caché).

## Decisión

- Cuando un Medio queda listo, Catálogo genera una versión nueva del MenúPublicado de cada sucursal que lo usa, copiando la vigente con el video en lugar de la foto, nunca desde el borrador. La versión anota su origen: publicación o medio listo.
- El worker de medios, tras marcar el Medio como listo, llama directo a Catálogo (mismo monolito y contexto). Si la llamada falla, el trabajo se reintenta desde la cola, y Catálogo no genera dos versiones para el mismo Medio. Mientras tanto, el menú sigue con la foto.
- Si coincide con una publicación de una persona, ambas parten de la última versión en la misma transacción.
- Si la optimización falla, se queda la foto y se avisa al admin.

## Alternativas consideradas

- Un menú que apunta al Medio y cambia sin cambiar de versión: contradice la caché por versión en todas las capas.

## Consecuencias

- Positivas: "cacheable por versión" es cierto en todas las capas, y el menú sigue listo para leer.
- Negativas y riesgos aceptados: versiones que no publicó una persona; concurrencia con las publicaciones, resuelta con el número de versión de la sucursal.
- Evidencia de cierre: la versión más nueva tiene el video y los cambios publicados.
