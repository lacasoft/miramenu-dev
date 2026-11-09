# ADR-0029: Identificar la sucursal con subdominio y slug en la ruta

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu
- Fuente: hueco del diseño detectado al planear el primer flujo; completa ADR-0010 y ADR-0018

## Contexto

El QR redirige "al subdominio actual de la sucursal" (ADR-0018), pero el subdominio de la sucursal es opcional en el diseño: una sucursal puede usar el del negocio. En ese caso la URL no dice cuál sucursal es, y el menú es por sucursal.

## Decisión

- Cada Sucursal tiene un **slug** único dentro de su negocio (por ejemplo, `centro`).
- Si la sucursal usa el subdominio del negocio, su menú vive en `<subdominio-del-negocio>.mirame.nu/<slug>`.
- Si la sucursal tiene subdominio propio, su menú vive en `<subdominio-de-la-sucursal>.mirame.nu/`.
- `GET /q/:code` redirige a la URL que corresponda en ese momento. La resolución de subdominio + slug a sucursal es parte del contrato "Resolver un enlace QR o un subdominio a su sucursal" de Negocios y acceso.
- Un slug que cambia sigue la misma regla que los subdominios viejos (ADR-0018): queda como alias de la misma sucursal y no se reasigna.

## Alternativas consideradas

- Subdominio propio obligatorio para cada sucursal: ruteo más simple, pero contradice que en el diseño sea opcional.

## Consecuencias

- Positivas: respeta el subdominio opcional y da URLs legibles por sucursal.
- Negativas y riesgos aceptados: un campo más (slug) con su unicidad y sus alias, y dos formas de URL que el proxy y la PWA deben entender.
