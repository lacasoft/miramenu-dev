# ADR-0023: Invitar a los admins nuevos con un enlace de un solo uso para definir su contraseña

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-23

## Contexto

Al dar de alta a un admin (ADR-0020) faltaba definir cómo recibe su contraseña (diseño, _Requisitos → Aislamiento y roles → Quién da acceso_).

Atributos en juego (ISO/IEC 25010): seguridad (confidencialidad de credenciales).

## Decisión

- Dar de alta a un usuario le envía por correo un enlace de un solo uso para que defina él mismo su contraseña. La contraseña nunca va en el correo.
- El enlace vence en 48 h y reenviarlo invalida el anterior (InvitaciónAdmin: usuarioId, token cifrado, venceEn, usadoEn).
- Si el enlace venció, quien invitó lo reenvía.

## Alternativas consideradas

- Contraseña temporal enviada por correo o dada a mano: la contraseña viaja por correo o la conoce quien invita.

## Consecuencias

- Positivas: la contraseña nunca viaja por correo ni la conoce quien invita.
- Negativas y riesgos aceptados: un proveedor de correo externo más, aún sin elegir; si el correo no llega, el admin no entra hasta que se lo reenvíen.
- Falla asociada (_Cae el proveedor de correo_): no se pueden dar de alta admins nuevos; quien invitó reenvía al recuperarse y el enlace anterior queda inválido; los admins existentes entran normal.
