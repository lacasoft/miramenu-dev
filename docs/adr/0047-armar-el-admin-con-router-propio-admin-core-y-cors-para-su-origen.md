# ADR-0047: Armar el admin con un router propio, `admin-core` y CORS para su origen

- Estado: Aceptado
- Fecha: 2026-11-12
- Decisores: creador de Miramenu
- Fuente: plan de la fase 7 (app de admin), aprobado el 2026-11-12, con "Router propio (Recomendado)"

## Contexto

`apps/admin` era la plantilla de Vite. El API del admin ya estaba completo (fases 1–5) bajo `/admin`, con sesión por cookie `__Host-miramenu_admin` (ADR-0028, ADR-0035), escrituras que solo aceptan el `Origin` de `ADMIN_APP_URL` y la invitación con el token en el fragmento (ADR-0033).

El admin tendrá unas diez pantallas: login, invitación, negocios, sucursales, equipo, menú, moderación y dashboard. No hay pantallas aprobadas del admin, solo la composición de referencia del dashboard (`.claude/rules/design-system.md`).

Al planear se vio un hueco del API: CORS solo aceptaba el sitio público, sus subdominios en el mismo puerto y la lista `CORS_ALLOWED_ORIGINS`. En local el admin vive en `http://admin.miramenu.localhost:5174`, otro puerto que el sitio público, así que el navegador no podía leer ni una respuesta del API.

Atributos en juego (ISO/IEC 25010): mantenibilidad (reglas puras y probadas, pocas dependencias), seguridad (redirección abierta, el token fuera del historial) y capacidad de interacción (volver a donde se iba).

## Decisión

- **Router propio, sin dependencias.** La URL es el estado de navegación, como en la PWA.
  - `@miramenu/admin-core` (paquete nuevo, sin DOM, ADR-0024) guarda la tabla de rutas: ruta ↔ pantalla, qué pantallas piden sesión y `safeNext`. `safeNext` solo deja volver a una página propia detrás de la sesión, nunca a otro sitio (CWE-601).
  - La app lo lee con `useSyncExternalStore` sobre la History API (`platform/location.ts`).
  - Cada fase agrega sus rutas; una que la app no conoce es "no existe".
- **Reglas del admin en `admin-core`**, probadas con `node --test`:
  - qué alcanza cada persona por negocio (`accessOf`), solo para ofrecerle navegación, porque los permisos los decide el API (ADR-0032);
  - el flujo del login (espera por `Retry-After`);
  - la invitación: el token del fragmento y la contraseña contada como la cuenta el API.
- **Cliente del API:** `createAdminApi` en `@miramenu/api-client`, sobre el mismo núcleo que el del comensal (`requester`), que valida cada respuesta con los contratos. `isUnauthorized` distingue la sesión que terminó.
- **Sesión:**
  - Cualquier 401 deja la sesión en nada (`createQueryClient`). La app vuelve al login con la ruta para regresar y un aviso de que la sesión terminó.
  - Cerrar sesión olvida todo lo cargado, para que la siguiente persona no vea, ni por un instante, los datos de la anterior.
- **Invitación:** la pantalla lee el token del fragmento y lo saca de la barra de direcciones en cuanto lo lee, así que nunca queda en el historial. Lo manda en el cuerpo (ADR-0033). Si se recarga la página, el enlace ya no sirve; se vuelve a abrir desde el correo.
- **CORS acepta siempre `ADMIN_APP_URL`**, el mismo origen que ya exige `AdminOriginGuard` para las escrituras, esté en el puerto que esté. En producción (`admin.mirame.nu`) ya cabía como subdominio del sitio; ahora no depende de eso.
- **El dev server del admin escucha en el host y puerto de `ADMIN_APP_URL`**, donde el API lo espera y adonde llevan los enlaces de invitación.
- **Pantallas con el sistema visual**: superficies sólidas del dashboard, riel lateral flotante en escritorio y barra inferior en móvil. Se revisan por capturas en cada PR.

## Alternativas consideradas

- **React Router 7:** dependencia conocida, pero trae más de lo que piden unas diez rutas, y la tabla de rutas quedaría en la app en vez de en un paquete probado.
- **Poner `ADMIN_APP_URL` en `CORS_ALLOWED_ORIGINS` del `.env`:** funciona, pero deja en manos de cada entorno algo que el API ya sabe. Un `.env` que lo olvide rompe el admin en silencio.
- **Dejar el token en la URL hasta aceptar:** sobrevive a una recarga, pero queda en el historial del navegador, justo lo que ADR-0033 evita.

## Consecuencias

- **Positivas:**
  - Sin dependencias nuevas.
  - Las reglas del admin tienen pruebas sin navegador.
  - El admin funciona en local igual que en producción.
- **Negativas y riesgos aceptados:**
  - **Las rutas son nuestras:** cada pantalla nueva agrega su ruta a `admin-core` y sus pruebas.
  - **Una invitación recargada pide abrir de nuevo el correo.**
  - **Recuperar una contraseña olvidada sigue sin camino** (_Pendiente de confirmar_).
