# ADR-0018: Redirigir el QR con 302 sin caché del navegador y conservar los subdominios viejos como alias

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-18

## Contexto

El QR usa un enlace corto independiente del subdominio (ADR-0010). Un 301 en la resolución del QR deja guardado en el navegador el subdominio viejo, y después de un cambio de subdominio el QR llevaría al lugar equivocado (revisión con IA del 2026-11-09, caché del menú).

## Decisión

- La resolución del QR (`GET /q/:codigo` en el diseño) responde 302 con `Cache-Control: no-store` hacia el subdominio actual de la sucursal.
- Un subdominio viejo queda como alias del mismo negocio y nunca se reasigna a otro.

## Alternativas consideradas

- Redirección permanente (301): el navegador la guarda y no ve el cambio de subdominio.

## Consecuencias

- Positivas: el QR siempre lleva al restaurante correcto, aunque cambie el subdominio.
- Negativas y riesgos aceptados: una solicitud sin caché del navegador por escaneo (la resolución sí se guarda en Redis, ADR-0016) y nombres de subdominio que no se liberan.
