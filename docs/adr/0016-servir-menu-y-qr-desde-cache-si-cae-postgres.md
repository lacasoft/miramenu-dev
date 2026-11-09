# ADR-0016: Servir el menú y la resolución del QR desde caché si Postgres falla

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-16

## Contexto

Con una copia que vencía a los 60 s y una lectura cada ~86 s por sucursal de media, si caía Postgres el menú fallaba casi de inmediato, y la resolución del QR no tenía caché (revisión con IA del 2026-11-09, caché del menú). RNF-03 pide 99% de disponibilidad mensual. La caché no se justifica por carga (32 lecturas/s de una fila ya combinada las aguanta Postgres), sino por disponibilidad.

Atributos en juego (ISO/IEC 25010): fiabilidad (disponibilidad y tolerancia a fallas).

## Decisión

- La copia en Redis del menú publicado y de la resolución del QR y del subdominio se refresca a los 60 s y se conserva 24 h (supuesto).
- Si Postgres falla, Catálogo y Negocios y acceso sirven la copia que tienen, también a comensales nuevos.

## Alternativas consideradas

- Caché que vence a los 60 s: no protege la disponibilidad.
- Quitar la caché: Postgres sería punto único de falla del menú.

## Consecuencias

- Positivas: el menú y el QR siguen disponibles si cae Postgres.
- Negativas y riesgos aceptados: ~50 MB de Redis (supuesto: ~100 KB por menú) y un camino más que probar.
- Falla asociada (_Cae Postgres_): el menú y el QR salen de la caché; likes, comentarios y CMS fallan con un mensaje claro; la medición encola hasta el tope y luego rechaza lotes, que la PWA conserva.
