# ADR-0028: Usar una cookie de sesión opaca para el admin, con el hash del token en Postgres

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la base del backend; estaba pendiente en CLAUDE.project.md

## Contexto

El admin entra con usuario y contraseña (`POST /admin/sesion` en el diseño), con límite de intentos (ADR-0021). Hay que mantener la sesión entre solicitudes y poder cerrarla al instante, por ejemplo al quitar un rol. El admin y el API comparten sitio a través del proxy (`admin.mirame.nu` y el API detrás de él). ASVS 5.0 L2.

Atributos en juego (ISO/IEC 25010): seguridad (autenticidad, confidencialidad de las credenciales).

## Decisión

- Al entrar, el API crea un token aleatorio de alta entropía y lo manda en una cookie `HttpOnly`, `Secure` y `SameSite`. JavaScript nunca lo ve.
- En Postgres (esquema `business_access`) solo se guarda el **hash** del token, con usuario, creación, último uso y vencimiento. Cerrar sesión o revocarla borra la fila.
- La sesión no depende de Redis: si Redis cae, las sesiones abiertas siguen siendo válidas (el login sí se cierra, ADR-0021).
- Se implementa en la fase de Negocios y acceso.

## Alternativas consideradas

- JWT de acceso + refresh: sin estado en el servidor, pero revocar exige listas de bloqueo y el refresh hay que guardarlo en algún lado.

## Consecuencias

- Positivas: revocación inmediata, sin tokens al alcance de JavaScript, y un robo de la base no entrega tokens usables.
- Negativas y riesgos aceptados: una lectura a Postgres por solicitud autenticada del admin (poco tráfico); requiere protección CSRF en las rutas que cambian estado, que se define con la fase.
