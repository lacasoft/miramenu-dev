# ADR-0021: Limitar los intentos de login del admin por correo e IP, con espera creciente y sin bloquear la cuenta

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-21

## Contexto

El login del admin (usuario y contraseña) no limitaba los intentos, y detrás está el superadmin, que entra con un login simple y sin doble factor en esta versión (revisión con IA del 2026-11-09; RNF-08; _Fuera de alcance_).

Atributos en juego (ISO/IEC 25010): seguridad (autenticidad y resistencia a ataques de fuerza bruta).

## Decisión

- Límite de intentos por correo y por IP, contado en Redis, con una espera que crece tras cada fallo y sin bloquear la cuenta.
- La misma respuesta para correo inexistente o contraseña incorrecta.
- Si Redis cae, el login se cierra (supuesto), porque no se pueden comprobar los límites.

## Alternativas consideradas

- Login sin límite: adivinar contraseñas sería viable.
- Bloquear la cuenta tras varios fallos: un atacante podría dejar fuera a un admin legítimo.

## Consecuencias

- Positivas: adivinar contraseñas deja de ser viable, también la del superadmin, y la respuesta no revela qué correos existen.
- Negativas y riesgos aceptados: si cae Redis, ningún admin puede entrar (falla cerrado).
