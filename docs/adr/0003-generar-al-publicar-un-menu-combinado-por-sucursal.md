# ADR-0003: Generar al publicar un menú ya combinado por sucursal

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-03

## Contexto

Los cambios del CMS se guardan como borradores y el botón de publicar es el que los muestra al comensal (diseño, _Catálogo: publicación y medios_). El negocio publica el menú base y cada sucursal publica sus ajustes (precio, disponibilidad, platillos ocultos y platillos propios), por separado. El menú se lee ~32 veces por segundo en pico, una vez cada ~15 s por sucursal (_Escala y supuestos_), y RNF-01 exige que abra rápido.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (tiempo de lectura), adecuación funcional (ningún borrador visible al comensal).

## Decisión

- Publicar genera un MenúPublicado `(sucursalId, versión)` por sucursal, con base y ajustes ya combinados y los medios resueltos. Cada versión es contenido fijo y es lo único que lee el comensal.
- Al publicar el menú base, si un AjusteSucursal choca con el cambio, la API devuelve las sucursales afectadas antes de guardar; el ajuste solo se pisa si el negocio confirma.
- Una clave de idempotencia evita la doble publicación, y el número de versión del borrador rechaza una confirmación hecha sobre información vieja.
- La publicación del menú base genera el menú de todas las sucursales del negocio en una sola transacción, porque son pocas por negocio.

## Alternativas consideradas

- Combinar menú base y ajustes en cada lectura: lectura más cara, sin caché por versión, y un error podría mostrar un borrador.

## Consecuencias

- Positivas: lectura rápida y cacheable por versión; ningún borrador llega al comensal.
- Negativas y riesgos aceptados: cada publicación del negocio regenera el menú de todas sus sucursales.
- Fallas asociadas (_Flujo: publicar el menú base_): doble clic o reintento → misma clave, se devuelve la publicación original; otro admin cambió el borrador → rechazo por versión y se vuelve a mostrar el aviso; falla a mitad → la transacción no deja versiones parciales; Redis no responde al invalidar → Catálogo reintenta y la copia se refresca sola a los 60 s.
- Revisar si un negocio llega a tener tantas sucursales que su publicación ya no quepa en una transacción.
