# ADR-0035: Limitar la sesión del admin a 1 h sin uso y 12 h en total, y proteger contra CSRF por Origin

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la fase 1; completa ADR-0028

## Contexto

ADR-0028 fija una cookie de sesión opaca para el admin, con el hash del token en Postgres, pero no cuánto dura ni cómo se protege contra CSRF, que es el riesgo propio de una sesión por cookie: otra página podría hacer que el navegador del admin envíe una solicitud con su cookie.

Atributos en juego (ISO/IEC 25010): seguridad (autenticidad, integridad).

## Decisión

- **Duración:** la sesión vence tras **1 h sin uso** o a las **12 h** de abierta, lo que pase primero (`ADMIN_SESSION_IDLE_MINUTES`, `ADMIN_SESSION_ABSOLUTE_HOURS`). `last_seen_at` se actualiza como máximo una vez por minuto.
- **Cookie:** `__Host-miramenu_admin`, con `HttpOnly`, `Secure`, `SameSite=Strict` y `Path=/`. El prefijo `__Host-` obliga al navegador a mandarla solo por HTTPS y solo a ese host.
- **CSRF:** toda solicitud bajo `/admin` que cambia estado (POST, PUT, PATCH, DELETE), **login incluido**, debe traer un `Origin` igual a `ADMIN_APP_URL`; si no, responde 403 `ORIGIN_NOT_ALLOWED`. Los navegadores siempre mandan `Origin` en esas solicitudes y una página de otro sitio no puede falsificarlo.
- **Caché:** toda respuesta bajo `/admin` lleva `Cache-Control: no-store`.
- **Revocación:** cerrar sesión la revoca en la base; los roles se leen de nuevo en cada solicitud, así que quitar un rol aplica de inmediato.

## Alternativas consideradas

- 8 h sin uso y 7 días en total: menos logins, pero una sesión robada vale mucho más tiempo.
- Token CSRF sincronizado (doble envío): más piezas para el mismo efecto que `SameSite=Strict` más el chequeo de `Origin`.

## Consecuencias

- Positivas: dos defensas independientes contra CSRF y sesiones cortas.
- Negativas y riesgos aceptados: clientes sin navegador (scripts) deben mandar el `Origin` del admin para escribir. Detrás de un proxy hay que fijar `TRUST_PROXY_HOPS` para que el límite de login vea la IP real del cliente.
