# ADR-0045: Servir el API en un solo host del sitio, con CORS para cada restaurante

- Estado: Aceptado
- Fecha: 2026-11-12
- Decisores: creador de Miramenu
- Fuente: plan de la fase 6 (PWA del comensal), aprobado el 2026-11-12; cierra "Con el proxy: … la cookie del comensal … y CORS para los subdominios" de _Pendiente de confirmar_

## Contexto

La PWA de cada restaurante vive en su subdominio (`tacos.mirame.nu`, ADR-0029). La sesión del comensal es una cookie `__Host-miramenu_diner`, `Secure`, `HttpOnly` y `SameSite=Strict` (ADR-0039). Una cookie `__Host-` queda atada al host exacto que la creó.

Hay dos maneras de llegar al API:

- **Dentro de cada subdominio** (`tacos.mirame.nu/api`): mismo origen, sin CORS. Pero la cookie queda atada a ese restaurante y el comensal tendría que validar su celular otra vez en cada uno, aunque su cuenta es global (ADR-0007).
- **En un solo host** (`api.mirame.nu`): la cookie es una sola. Como la PWA y el API son del mismo sitio (`mirame.nu`), el navegador manda la cookie `Strict` en los `fetch` con `credentials: 'include'`. Hace falta CORS para cada subdominio.

Hasta aquí, CORS era una lista exacta y venía vacía, porque se suponía el mismo sitio detrás del proxy. El 2026-11-12 se comprobó en Chrome que una cookie `__Host-` con `Secure` y `SameSite=Strict`, creada por `http://api.miramenu.localhost`, se envía desde `http://tacos.miramenu.localhost`. Así, desarrollo puede usar la misma forma que producción.

Atributos en juego (ISO/IEC 25010): capacidad de interacción (registrarse una vez), seguridad (CSRF y quién puede leer respuestas con credenciales) y eficiencia de desempeño (preflights).

## Decisión

- **Un solo host para el API.** `api.mirame.nu` en producción y `http://api.miramenu.localhost:3000` en desarrollo (`VITE_API_URL`). La cookie del comensal sirve en todos los restaurantes.
- **CORS acepta siempre el sitio público y cualquier subdominio suyo**, con el mismo esquema y puerto, más la lista `CORS_ALLOWED_ORIGINS`.
  - Reutiliza `isPublicSiteOrigin`, la misma regla de `PublicSiteOriginGuard` para el CSRF del comensal.
  - Responde con el origen exacto (nunca `*`), `Allow-Credentials` y `Vary: Origin`.
  - Cualquier otro origen, `null` incluido, no recibe headers de CORS.
- **Preflights en caché por 10 min** (`Access-Control-Max-Age: 600`), para que las escrituras del comensal no paguen uno cada vez. Las lecturas del cliente evitan el preflight porque no llevan headers propios (ADR-0044).
- **En producción**, el proxy de entrada enruta `api.mirame.nu` al API, y los demás subdominios a la PWA. Las rutas del API no cambian.

## Alternativas consideradas

- **API dentro de cada subdominio:**
  - A favor: no hay CORS y no hay preflights.
  - En contra: rompe la cuenta global en la práctica, porque el comensal se registraría una vez por restaurante.
- **Cookie con `Domain=.mirame.nu` en vez de `__Host-`:** compartiría la sesión entre subdominios sin un host aparte. A cambio, la cookie llegaría a todo subdominio y se pierde la protección de `__Host-`.
- **Proxy de Vite solo en desarrollo:** solo se hubiera usado si la prueba en Chrome fallaba. No hizo falta.

## Consecuencias

- **Positivas:**
  - El comensal se registra una vez.
  - Desarrollo y producción tienen la misma forma.
  - El CSRF ya estaba cubierto por el `Origin` (ADR-0039).
- **Negativas y riesgos aceptados:**
  - **Todo subdominio de `mirame.nu` es de confianza** para leer respuestas con la cookie del comensal. Ningún subdominio puede servir contenido que no sea nuestro: ni páginas de terceros ni dominios propios de los negocios (fuera de alcance en v1).
  - Las escrituras pagan un preflight cada 10 min por origen.
  - El proxy debe reservar `api` como subdominio, y ya lo es en `RESERVED_SUBDOMAINS`.
