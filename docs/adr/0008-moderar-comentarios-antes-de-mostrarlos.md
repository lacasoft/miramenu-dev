# ADR-0008: Moderar los comentarios antes de mostrarlos

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-08

## Contexto

El producto debe permitir moderar comentarios (diseño, _Requisitos → Qué pasa de la demo al producto_). Se esperan 0.2 comentarios por sesión: ~100,000 al día, ~200 por sucursal al día, probablemente menos porque comentar exige registro (_Escala y supuestos_).

## Decisión

- Un comentario nuevo queda en espera hasta que un moderador lo aprueba.
- El comensal puede editar y borrar sus propios comentarios; si edita uno aprobado, vuelve a quedar en espera.
- Moderan el admin restaurante, el admin de cada sucursal para los comentarios de la suya y el superadmin.
- Solo los comentarios aprobados se ven en el menú y cuentan en el dashboard.

## Alternativas consideradas

- Publicar al instante y ocultar después: lo ofensivo se ve mientras nadie lo oculta.

## Consecuencias

- Positivas: nada ofensivo llega a verse.
- Negativas y riesgos aceptados: ~200 comentarios por sucursal al día que aprobar a mano, y una espera hasta que el comentario se ve.
- Falla asociada: comentarios con más de 24 h en espera → se avisa al admin de la sucursal y al del negocio.
- Revisar si la carga de moderación se vuelve inmanejable para los negocios.
