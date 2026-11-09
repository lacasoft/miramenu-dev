# ADR-0010: Usar en el QR un enlace corto independiente del subdominio

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-10

## Contexto

Cada sucursal tiene su propio QR, y hay subdominios por negocio o sucursal (diseño, _Requisitos → Acceso y QR_). El subdominio puede cambiar (hoy `mirestaurante.mirame.nu`, mañana `elrestaurante.mirame.nu`) y el QR impreso debe seguir llevando al mismo restaurante.

## Decisión

- El QR apunta a un enlace corto, como `mirame.nu/12345`.
- El EnlaceQR (código corto único → sucursalId) nunca se reasigna a otra sucursal.
- Negocios y acceso resuelve el código y redirige al subdominio actual de la sucursal (forma de la redirección en ADR-0018).

## Alternativas consideradas

- QR con la URL directa del menú: cambiar el subdominio obligaría a reimprimir los QR.

## Consecuencias

- Positivas: el subdominio puede cambiar sin reimprimir los QR.
- Negativas y riesgos aceptados: un salto de redirección al abrir el menú, que cuenta dentro del presupuesto de RNF-01.
