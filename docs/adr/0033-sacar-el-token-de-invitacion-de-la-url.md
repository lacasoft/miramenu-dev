# ADR-0033: Sacar el token de invitación de la URL

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: revisión del contrato del diseño (`POST /admin/invitaciones/:token`) al planear la fase 1; completa ADR-0023

## Contexto

El diseño define la aceptación de la invitación con el token en la ruta. Las URLs quedan en los logs de acceso del proxy y del API, en el historial del navegador y en el header `Referer` de cualquier recurso externo que cargue la página. Un token de invitación de 48 h que aparece en un log permite definir la contraseña de otra persona.

Atributos en juego (ISO/IEC 25010): seguridad (confidencialidad de credenciales).

## Decisión

- El correo enlaza a `ADMIN_APP_URL/invitation#token=<token>`. El fragmento (`#…`) nunca viaja al servidor ni aparece en el `Referer`.
- La app de admin lee el fragmento y manda el token **en el cuerpo** de `POST /admin/invitations/accept` (`{ token, password }`).
- En la base solo se guarda el SHA-256 del token, y el API verifica el token antes de calcular el hash de la contraseña (`scrypt`), para que tokens inventados no le hagan gastar 128 MiB por intento.

## Alternativas consideradas

- La ruta del diseño, con el token en la URL: más simple, pero el token queda en los logs.

## Consecuencias

- Positivas: el token no aparece en ningún log ni encabezado; mismo flujo para la persona invitada.
- Negativas y riesgos aceptados: la app de admin debe leer el fragmento (un detalle de la fase de frontend). El contrato del API difiere del que escribió el diseño.
