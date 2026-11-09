# ADR-0020: Dar acceso desde el superadmin y el admin restaurante, con el superadmin solo en la semilla

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-20

## Contexto

El diseño no decía quién puede dar acceso a un negocio (revisión con IA del 2026-11-09, aislamiento entre negocios). En juego: RNF-05 (aislamiento) y RNF-08 (el superadmin se crea desde la semilla y no se puede crear otro).

Atributos en juego (ISO/IEC 25010): seguridad (control de acceso).

## Decisión

- El superadmin da de alta cada negocio y su primer admin restaurante (supuesto: los negocios no se registran solos).
- El admin restaurante asigna admin restaurante o admin sucursal, y solo dentro de su negocio.
- El admin sucursal no asigna roles.
- El rol superadmin no se asigna por la API: solo existe en la semilla.
- Cada asignación es una AsignaciónRol `(usuarioId, negocioId, sucursalId opcional, rol)`.

## Alternativas consideradas

- Negocios que se registran solos.
- Roles asignables sin regla.

## Consecuencias

- Positivas: nadie se da acceso a otro negocio ni sube su propio rol.
- Negativas y riesgos aceptados: alta manual de cada negocio, ~100 el primer año.
- La entrega de la contraseña al admin nuevo está en ADR-0023.
