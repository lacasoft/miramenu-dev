# miramenu — Definición para Claude

> Diseño de origen: `../miramenu/design.md` (actualizado 2026-11-09). Decisiones en `docs/adr/`.

## Visión del producto

Menú digital multitenant para restaurantes en México. El comensal escanea el QR de su sucursal y recorre el menú en un grid de 2 columnas; al tocar un platillo entra a un feed vertical con avance automático (el video avanza al terminar, la imagen a los 5 s; al tocar se pausa 10 s; scroll infinito que se repite). Da likes como anónimo y comenta tras registrarse con un celular validado. Cada negocio carga su menú base en un CMS (borrador → publicar), cada sucursal lo ajusta, y ambos ven un dashboard (vistas, exposición, paso rápido) y moderan comentarios. Sale de la demo `menu_experience`.

Actores: comensal anónimo · comensal registrado · admin restaurante · admin sucursal · superadmin (solo el creador de Miramenu).

Fuera de alcance (v1): recomendar platillos · enviar ofertas (el registro ya las prepara) · doble factor del superadmin · pedidos, carrito o pagos · cobro a los negocios · app nativa · dominios propios (solo subdominios de `mirame.nu`) · IA para descripciones o fotos.

## Modelo / dominio

Identificadores en inglés (decidido 2026-11-09). Glosario propuesto al trasladar el diseño; ajústalo antes de crear tablas:

| Contexto → módulo / esquema                               | Diseño → código                                                                                                                                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Negocios y acceso → `business-access` / `business_access` | Negocio `Business` · Sucursal `Branch` · Subdominio `Subdomain` · EnlaceQR `QrLink` · UsuarioAdmin `AdminUser` · AsignaciónRol `RoleAssignment` · InvitaciónAdmin `AdminInvitation` · roles `business_admin`, `branch_admin`, `superadmin` |
| Catálogo → `catalog`                                      | Categoría `Category` · Platillo `Dish` · AjusteSucursal `BranchOverride` · Medio `MediaAsset` (`processing`/`ready`/`failed`) · Perfil `Profile` · MenúPublicado `PublishedMenu` (origen `publication`/`media_ready`)                      |
| Comensales → `diners`                                     | Comensal `Diner` · Dispositivo `Device` · CódigoValidación `VerificationCode` (vive en Redis) · Consentimiento `Consent` · aviso ComensalRegistrado `DinerRegistered`                                                                      |
| Interacciones → `interactions`                            | Like `Like` · Comentario `Comment` (`pending`/`approved`/`rejected`/`deleted`)                                                                                                                                                             |
| Medición → `measurement`                                  | Evento `MeasurementEvent` · Agregado `HourlyAggregate` · Entrada `FeedEntry` · vista `view` · exposición `exposure` · paso rápido `quickSkip` · salida `manual`/`auto`/`abandoned`                                                         |

Contextos y propiedad (del diseño, tal cual):

| Contexto          | Reglas y lenguaje                                                                                                     | Dueño de los datos                                                     | Contratos que expone                                                                                                                 | Usa de otros                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Negocios y acceso | Negocio, sucursal, subdominio, enlace corto del QR, usuario admin, rol y superadmin de la semilla                     | Negocio, Sucursal, Subdominio, EnlaceQR, UsuarioAdmin, InvitaciónAdmin | Resolver un enlace QR o un subdominio a su sucursal · Verificar el permiso de un usuario en un negocio o sucursal                    | Canal externo de correo, para las invitaciones                |
| Catálogo          | Menú base, ajuste de sucursal, platillo propio, disponibilidad, aviso de diferencias, perfil del restaurante y medios | Categoría, Platillo, AjusteSucursal, Medio, Perfil                     | Menú publicado de una sucursal · Confirmar que un platillo está en una sucursal                                                      | Negocios y acceso: sucursales y permisos                      |
| Comensales        | Anónimo, registrado, dispositivo, código de validación y consentimiento                                               | Comensal, Dispositivo, Consentimiento                                  | Identificar al comensal, anónimo o registrado · Nombre público · Aviso `ComensalRegistrado`, con el dispositivo que pasa a la cuenta | Canal externo de códigos: WhatsApp o SMS                      |
| Interacciones     | Like por platillo y sucursal, comentario con registro y moderación                                                    | Like, Comentario                                                       | Dar o quitar like · Publicar y ocultar comentarios · Conteos por platillo y sucursal                                                 | Catálogo, Comensales y Negocios y acceso para moderar         |
| Medición          | Entrada, vista válida, exposición, paso rápido, salida manual, automática o abandono y agregado                       | Evento, Agregado                                                       | Recibir lotes de eventos · Métricas por sucursal o agrupadas por negocio                                                             | Catálogo, Negocios y acceso, e Interacciones para los conteos |

Claves: Like único `(sucursal, platillo, comensal o dispositivo)` · AjusteSucursal `(sucursal, platillo)` · MenúPublicado `(sucursal, versión)` · Agregado `(sucursal, platillo, hora)` · Evento único `(día, eventoId)`. El resto, en el diseño (_Entidades y claves de acceso_).

## Stack tecnológico

- Monorepo con npm workspaces (`apps/*`, `packages/*`) y un solo `package-lock.json`; las dependencias quedan en el `node_modules/` de la raíz. Node local v25.8.1 (no hay `engines` ni `.nvmrc`).
- `apps/api`: NestJS 12.4 (`platform-express`), TypeScript 6.0, CommonJS que carga los paquetes ESM de Nest con `require(esm)`. Jest 30 + ts-jest + supertest. Oxlint 1.93 type-aware y Prettier 3.9.
- `apps/pwa` y `apps/admin`: React 19.3, Vite 8.3, TypeScript 7.0 (instalado en cada app), Oxlint. Sin ESLint ni runner de tests.
- Raíz: Husky 9 + commitlint 21 (`config-conventional`) en `commit-msg`.
- Decidido en el diseño, aún sin instalar: Postgres (un esquema por contexto), Redis, `ffmpeg`, almacenamiento de objetos y Docker en local. ORM: TypeORM ([ADR-0025](docs/adr/0025-usar-typeorm-con-migraciones-revisadas-a-mano.md)).

## Estructura del repositorio

- `apps/api` — monolito modular, un módulo por contexto en `src/modules/<contexto>/`, con los nombres del glosario (`business-access`, `catalog`, `diners`, `interactions`, `measurement`); hoy están vacíos. Los workers de medios y de medición son parte del mismo monolito.
- `apps/pwa` — PWA del comensal. `apps/admin` — CMS, publicación, moderación y dashboard. Las dos siguen siendo la plantilla de Vite.
- `packages/tokens` (`@miramenu/tokens`, tokens del sistema visual y su CSS generado) y `packages/icons` (`@miramenu/icons`, geometría de iconos); reglas en `.claude/rules/design-system.md`. Aquí van también los paquetes sin DOM (estado, cliente de la API, reglas de la PWA, tipos) y las interfaces por plataforma de IndexedDB, `sendBeacon` y `visibilitychange` ([ADR-0024](docs/adr/0024-separar-la-logica-del-frontend-en-paquetes-sin-dom.md)).
- `docs/adr/` — ADRs. `docs/diseno-visual/` — especificación y pantallas aprobadas (`dashboard.png` solo en local: es de terceros). Del resto de `docs/`, nada se versiona. `.pi/` — configuración del kit para Pi Agent.

## Arquitectura

Proxy de entrada (HTTPS, `*.mirame.nu`, enruta a la PWA, al admin o a la API) → API NestJS → Postgres como fuente de verdad, Redis (colas, caché, límites, códigos), almacenamiento de objetos y dos workers asíncronos. Diagramas: `diagram:architecture` y `diagram:architecture-admin` en el diseño.

### Responsabilidades y límites (del diseño, tal cual)

| Componente                           | Contexto          | Responsable de                                                                                                                                                                                                                                              | No le toca                                                                                                        | Estado (dueño · fuente de verdad)                                                                             | Ejecución                 |
| ------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------- |
| PWA del comensal (React)             | —                 | Grid, feed con avance automático, likes, comentarios y registro. Arma los eventos de medición en el celular y los envía en lotes. Al ocultarse la página, cierra la entrada abierta y envía el lote pendiente                                               | Calcular métricas o decidir qué está publicado                                                                    | Pantalla, id del dispositivo y eventos aún sin confirmar, en IndexedDB                                        | Síncrona, en el navegador |
| App de admin (React)                 | —                 | CMS, publicación, moderación y dashboard                                                                                                                                                                                                                    | Combinar menú base y ajustes, que lo hace Catálogo                                                                | —                                                                                                             | Síncrona, en el navegador |
| Proxy de entrada                     | —                 | HTTPS, subdominios `*.mirame.nu` y enrutar a la PWA, al admin o a la API                                                                                                                                                                                    | Decidir a qué sucursal corresponde un subdominio                                                                  | —                                                                                                             | Síncrona                  |
| API (NestJS, monolito modular)       | Todos             | Recibir la solicitud, identificar al actor y pasarla al módulo del contexto                                                                                                                                                                                 | Reglas de negocio: viven en los módulos. Tampoco decide permisos: cada módulo verifica el permiso sobre el objeto | —                                                                                                             | Síncrona                  |
| Módulo Negocios y acceso             | Negocios y acceso | Negocios, sucursales, subdominios, enlaces QR, usuarios y permisos. Guarda en caché la resolución del QR y del subdominio, y la sirve si Postgres falla. Decide quién puede asignar qué rol, envía las invitaciones de admin y limita los intentos de login | El menú y los comensales                                                                                          | Su esquema en Postgres                                                                                        | Síncrona                  |
| Módulo Catálogo                      | Catálogo          | Borradores, publicación, choques con ajustes, perfiles y medios. Genera la versión nueva del menú cuando un Medio queda listo, y sirve la copia en caché si Postgres falla                                                                                  | Optimizar archivos, que lo hace el worker de medios                                                               | Su esquema en Postgres, incluido MenúPublicado                                                                | Síncrona                  |
| Módulo Comensales                    | Comensales        | Registro, códigos de validación, cuenta global y consentimiento                                                                                                                                                                                             | Los likes, que pasan a la cuenta en Interacciones                                                                 | Su esquema en Postgres                                                                                        | Síncrona                  |
| Módulo Interacciones                 | Interacciones     | Likes, comentarios y moderación                                                                                                                                                                                                                             | Mostrar el celular del comensal: solo pide su nombre                                                              | Su esquema en Postgres                                                                                        | Síncrona                  |
| Módulo Medición                      | Medición          | Aceptar lotes de eventos, rechazarlos cuando la cola pasa su tope y responder el dashboard                                                                                                                                                                  | Guardar cada evento al recibirlo: lo encola                                                                       | Su esquema en Postgres                                                                                        | Síncrona                  |
| Worker de medios (NestJS + `ffmpeg`) | Catálogo          | Optimizar fotos y videos y marcar cada Medio como listo o fallido. Al quedar listo, avisa a Catálogo con una llamada directa                                                                                                                                | Publicar el menú                                                                                                  | Variantes en el almacenamiento de objetos                                                                     | Asíncrona                 |
| Worker de medición (NestJS)          | Medición          | Guardar los eventos y sumar al agregado por hora, en una transacción por lote y contando solo los eventos nuevos. Descarta los eventos cuyo platillo no está en el menú de esa sucursal, con el contrato de Catálogo                                        | Atender solicitudes                                                                                               | Evento y Agregado                                                                                             | Asíncrona                 |
| Postgres                             | —                 | Fuente de verdad, con un esquema por contexto                                                                                                                                                                                                               | —                                                                                                                 | Todo lo que no puede perderse                                                                                 | —                         |
| Redis                                | —                 | Cola de trabajos de medios y de medición, límites de envío de códigos y de intentos de login, códigos con vencimiento, caché del menú publicado y de la resolución del QR y del subdominio                                                                  | Guardar algo que no pueda perderse, salvo la cola de medición, con pérdida máxima de ~1 s                         | Efímero, salvo la cola de medición: AOF cada segundo (`appendfsync everysec`) y `maxmemory-policy noeviction` | —                         |
| Almacenamiento de objetos            | —                 | Originales y variantes de los medios, servidos directo al celular, nunca por la API                                                                                                                                                                         | —                                                                                                                 | Archivos                                                                                                      | —                         |
| Proveedor de códigos                 | Externo           | Entregar el código por WhatsApp o SMS; canal sin elegir                                                                                                                                                                                                     | —                                                                                                                 | —                                                                                                             | Asíncrona                 |
| Proveedor de correo                  | Externo           | Entregar la invitación a los admins nuevos; proveedor sin elegir                                                                                                                                                                                            | —                                                                                                                 | —                                                                                                             | Asíncrona                 |

### Recorrido

- Comensal: QR `mirame.nu/<código>` → Negocios y acceso resuelve (caché en Redis; si no, Postgres) → 302 al subdominio → el proxy entrega la PWA → menú publicado de la caché o de Catálogo → medios directo del almacenamiento, con carga diferida → like a Interacciones (visible en otros celulares en ≤30 s) → comentar exige registro con código.
- Medición (asíncrona): la PWA envía lotes → Medición los encola en Redis y responde → el worker guarda y suma los agregados por hora.
- Admin: subir un medio guarda el original y encola su optimización → el worker deja las variantes, marca el Medio y llama a Catálogo → versión nueva del menú. Publicar genera un MenúPublicado por sucursal e invalida la caché.

### Contratos

Errores `{ code, message, requestId }` · listas por cursor (20 por defecto, 50 máx.) · toda ruta `/admin` responde 404 si el objeto no es del negocio o la sucursal del actor. Rutas en inglés según el glosario (el diseño las nombra en español):

| Caso               | Ruta                                                                                                                                                         | Reglas                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QR                 | `GET /q/:code`                                                                                                                                               | 302 al subdominio actual, `Cache-Control: no-store`                                                                                                                |
| Menú               | `GET /branches/:id/menu`                                                                                                                                     | Último PublishedMenu, cacheable por versión; copia en caché si Postgres falla                                                                                      |
| Like               | `PUT /branches/:branchId/dishes/:dishId/like`                                                                                                                | Fija el estado (`active`): repetirlo no duplica                                                                                                                    |
| Comentarios        | `GET …/dishes/:dishId/comments` · `POST /comments` · `PATCH`/`DELETE /comments/:id`                                                                          | Solo aprobados · exige registro, id del cliente contra duplicados, nace en espera · solo el autor; editar vuelve a espera                                          |
| Registro           | `POST /registration/code` · `POST /registration/verify`                                                                                                      | Límite por celular y por dispositivo · emite `DinerRegistered`                                                                                                     |
| Medición           | `POST /events/batch`                                                                                                                                         | Lote acotado; descarta duplicados por eventId y responde por evento; rechaza si la cola pasa su tope; acepta `sendBeacon`; descarta eventos con >7 días de retraso |
| Login admin        | `POST /admin/session`                                                                                                                                        | Límite por correo e IP con espera creciente, sin bloqueo; misma respuesta para cualquier fallo                                                                     |
| Acceso             | `POST /admin/businesses` (superadmin) · `POST /admin/businesses/:businessId/users` · `PUT`/`DELETE …/users/:userId/roles` · `POST /admin/invitations/:token` | Reglas de roles abajo; dar de alta envía la invitación                                                                                                             |
| CMS                | `/admin/businesses/:businessId/dishes` · `/admin/branches/:branchId/overrides` · `POST /admin/media`                                                         | Solo borrador · el medio responde al recibirse y se optimiza en segundo plano                                                                                      |
| Publicar           | `POST /admin/businesses/:businessId/publications` · `POST /admin/branches/:branchId/publications`                                                            | Devuelve los choques antes de pisar; clave de idempotencia                                                                                                         |
| Moderar · métricas | `GET /admin/moderation` · `POST /admin/comments/:id/approve` o `/reject` · `GET /admin/metrics`                                                              | Admin restaurante, admin de esa sucursal o superadmin · por sucursal o agrupado, con período                                                                       |

### Fallas previstas

- Cae Postgres → menú y QR desde la caché (24 h); likes, comentarios y CMS fallan con un mensaje claro; la medición encola hasta el tope y luego rechaza lotes, que la PWA conserva.
- Cae Redis → menú desde Postgres; no se envían códigos; la medición rechaza lotes; la cola vuelve del AOF; el login del admin se cierra.
- Redis lento (>~100 ms) → la caché no espera ni reintenta y se lee de Postgres; la cola mantiene sus reintentos.
- Cae el almacenamiento → skeletons y textos. Cae el worker de medios → Medio en `processing` >10 min: sigue la foto y se avisa al admin.
- Cae el proveedor de códigos → sin registros nuevos; menú y likes siguen. Cae el de correo → sin altas de admin; reenviar invalida el enlace anterior.
- Comentarios >24 h en espera → aviso al admin de la sucursal y al del negocio. Comensal sin red → conserva el menú cargado y los eventos en IndexedDB, y los reenvía al reabrir.

## Reglas de negocio (invariantes)

- Cada contexto escribe solo sus datos y su esquema; los demás usan sus contratos. Comensales no toca los likes; el negocio solo ve el nombre del comensal, nunca su celular ni su correo.
- Aislamiento (RNF-05): cada módulo verifica en un solo punto, con "Verificar el permiso", sobre el negocio y la sucursal del objeto; si no corresponde, 404. El superadmin pasa por el mismo chequeo. Los ids del cuerpo se comprueban del mismo negocio; en Catálogo, con claves foráneas que incluyen `businessId`.
- Roles: el superadmin solo existe en la semilla y nunca se asigna por la API; da de alta negocios y su primer admin restaurante. El admin restaurante asigna roles solo en su negocio; el admin sucursal no asigna.
- Invitación de admin: un solo uso, vence a las 48 h, reenviarla invalida la anterior; la contraseña nunca va en el correo.
- El comensal solo lee PublishedMenu; ningún borrador le llega. Cada versión es fija. Un Medio listo genera una versión nueva copiada de la vigente, nunca del borrador, y nunca dos versiones por el mismo Medio.
- Publicar el menú base devuelve los choques con ajustes antes de guardar; un ajuste solo se pisa si el negocio confirma. Toda publicación lleva clave de idempotencia y versión del borrador.
- La sucursal ajusta precio y disponibilidad, oculta platillos y agrega los suyos. Precios en centavos, con moneda.
- EnlaceQR y subdominios nunca se reasignan; un subdominio viejo queda como alias del mismo negocio.
- Al registrarse, los likes del dispositivo pasan a la cuenta, con un solo like por platillo.
- Comentar exige registro; todo comentario nace en espera y editar uno aprobado lo devuelve a espera; solo los aprobados se ven y cuentan.
- Medición: una vista solo cuenta en el feed; el paso rápido mide solo saltos manuales; una salida por abandono dura hasta que la página se oculta y no es paso rápido. Cada evento cuenta una vez. Se descartan los eventos de platillos fuera del menú de la sucursal y los de más de 7 días de retraso.

## Seguridad y compliance

- Objetivo **ASVS 5.0 L2** (decidido 2026-11-09): hay login, roles multitenant y datos personales. Sin LLMs ni agentes en el producto.
- Datos personales de comensales (celular, nombre, correo): Miramenu es dueño y responde por ellos ([ADR-0007](docs/adr/0007-usar-cuenta-global-de-miramenu-para-el-comensal.md)); el consentimiento guarda la versión del aviso de privacidad. Retención por revisar contra la ley mexicana de datos personales.
- Superadmin: semilla y login simple, sin doble factor en v1. Login con límites ([ADR-0021](docs/adr/0021-limitar-intentos-de-login-sin-bloquear-la-cuenta.md)); si cae Redis, falla cerrado.
- Códigos de validación: vencen en minutos, con intentos limitados y límite de envíos por celular y por dispositivo, porque cada envío cuesta.
- Los eventos de medición vienen de un cliente no confiable: el worker valida el platillo contra Catálogo; los eventos falsos sobre platillos de la propia sucursal son un riesgo aceptado.

## Atributos de calidad

- Eficiencia de desempeño: primera tarjeta utilizable en ≤3 s en ≥18 de 20 aperturas frías, con 10 Mbps y RTT ~100 ms (RNF-01); respuesta visual a un toque en ≤100 ms (RNF-02); skeletons y carga diferida en todo el sistema (RNF-09).
- Fiabilidad: 99% mensual, ≤7.2 h de caída (RNF-03). Consistencia eventual de likes, comentarios y dashboard en ≤30 s (RNF-04).
- Flexibilidad: hoy solo México, preparado para otras regiones (RNF-06).
- Carga del primer año (500 sucursales): 500,000 sesiones/día; en pico, 32.4 sesiones/s (~5,800 a la vez), ~2,300 eventos/s en ~1,200 solicitudes/s y 65 likes/s; medios a 1.7 Gbps en pico, ~100 TB/mes; crudos 25.2 GB/día, ~2.3 TB a 90 días. A 3 años, ×3.

## Integraciones externas

- Proveedor de códigos (WhatsApp o SMS, sin elegir): espera de 5 s; si no responde, consultar el estado del envío por su id antes de reenviar; el comensal puede pedir otro código a los 60 s.
- Proveedor de correo (sin elegir): invitaciones de admin.
- Almacenamiento de objetos (sin elegir): originales y variantes, servidos directo al celular; CDN en producción.

## Convenciones de código

- Identificadores, rutas, tablas y esquemas en inglés según el glosario; documentación y ADRs en español.
- Módulos de Nest en `src/modules/<contexto>/` con carpeta kebab-case; esquemas de Postgres en snake_case.
- Prettier solo está configurado en `apps/api` (`singleQuote`, `trailingComma: all`). En las tres apps el linter es Oxlint, no ESLint.

## Comandos principales

Corridos el 2026-11-09 desde la raíz (✓ pasa · ✗ falla tal como está):

- `npm run build -w api` ✓ · `npm run lint -w api` ✓ · `npm run start:dev -w api` (no corrido)
- `npm test -w api` ✗ y `npm run test:e2e -w api` ✗ con `MODULE_NOT_FOUND` (ver gotchas). Lo que funciona, desde `apps/api`:
  - `node --experimental-vm-modules ../../node_modules/jest/bin/jest.js` ✓ (unitarios)
  - `node --experimental-vm-modules ../../node_modules/jest/bin/jest.js --config ./test/jest-e2e.json` ✓ (e2e)
- `npm run build -w pwa` ✓ · `npm run build -w admin` ✓ · `npm run lint -w pwa` ✓ · `npm run lint -w admin` ✓ · `npm run dev -w pwa` (no corrido)
- `npm run check -w packages/tokens` ✓ (CSS generado al día) · `npm run typecheck -w packages/tokens` ✓ · `npm run typecheck -w packages/icons` ✓
- Formato, desde `apps/api`: `npx prettier --check "src/**/*.ts" "test/**/*.ts"` ✓

## Despliegue / infraestructura

- Hoy solo hay desarrollo local, con todo en Docker (aún no hay `docker-compose`). Nube, servicios y región se definen al ir a producción; región inicial México.
- Sin CI: no hay `.github/workflows`, solo la plantilla de PR.
- Redis con AOF `appendfsync everysec` y `maxmemory-policy noeviction` ([ADR-0012](docs/adr/0012-mantener-la-cola-de-medicion-en-redis-con-aof-y-noeviction.md)).

## Variables de entorno críticas

- En `.env.example`, comentadas: `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`. `apps/api/src/main.ts` lee `PORT` directo de `process.env` (plantilla; falta la capa de config).
- PWA: los tiempos del feed (imagen 5 s, pausa 10 s) van en su `.env`, con prefijo `VITE_` (nombres por definir).
- Por declarar al integrarlos: almacenamiento de objetos, proveedor de códigos, proveedor de correo y dominio base.

## Testing

- API: Jest 30 + ts-jest. Unitarios en `src/**/*.spec.ts`, junto al código; e2e en `apps/api/test/*.e2e-spec.ts` con `@nestjs/testing` + supertest. `test:cov` existe, sin umbral configurado.
- PWA, admin y `packages/`: todavía sin runner de tests.
- Prueba de aislamiento obligatoria ([ADR-0019](docs/adr/0019-aislar-negocios-con-chequeo-por-modulo-y-404.md)): recorre todas las rutas `/admin` con un usuario de otro negocio y otro de otra sucursal, y exige 404. Cada ruta nueva entra en ella.

### Restricciones de arquitectura (intención: sin automatizar)

- Ningún módulo importa entidades, repositorios ni internos de otro contexto: solo sus contratos exportados.
- Ningún módulo consulta el esquema de Postgres de otro contexto.
- Comensales no escribe en Interacciones; Interacciones no lee el celular ni el correo del comensal.
- Los controladores no deciden permisos ni tienen reglas de negocio; el worker de medios no publica, solo llama al contrato de Catálogo.
- `apps/pwa` y `apps/admin` no se importan entre sí ni tienen lógica; `packages/*` no usan el DOM ni APIs del navegador fuera de sus adaptadores.

### Tests de recuperación (pendientes; con la skill `tdd`)

- Registro: proveedor sin respuesta en 5 s → se consulta el estado por id antes de reenviar · `DinerRegistered` perdido o duplicado → likes en la cuenta, sin duplicados · Redis cae entre el envío y la validación → el código nuevo valida.
- Publicar: misma clave de idempotencia → una publicación · borrador cambiado → rechazo por versión · falla a mitad → ninguna versión parcial · invalidación de caché fallida → reintento, y se sirve la versión nueva · Medio listo junto a una publicación → la versión más nueva tiene las dos cosas · llamada del worker a Catálogo reintentada → una sola versión por Medio.
- Medición: lote reenviado tras un timeout → cada eventId una vez · worker que cae a mitad (confirmación tras el commit) → el agregado de la hora coincide con la suma de sus crudos · lote que falla 3 veces → cola de errores · evento tardío → suma a su hora (≤7 días) o se descarta · reinicio de Redis → la cola vuelve del AOF · cola sobre su tope o Redis caído → lote rechazado y conservado en IndexedDB · página oculta → abandono, `sendBeacon` y reenvío al reabrir.
- Dependencias: Postgres caído → menú y `/q/:code` desde la caché · Redis lento → lectura de Postgres sin reintentos · Redis caído → login cerrado.

## Decisiones de arquitectura

Todas en estado `Aceptado`. DEC-NN del diseño = ADR-00NN; la 0025 se tomó al trasladar el diseño.

- [0001](docs/adr/0001-construir-el-backend-como-monolito-modular-nestjs.md) Monolito modular NestJS, un esquema de Postgres por contexto
- [0002](docs/adr/0002-usar-react-con-apps-separadas-para-comensal-y-admin.md) React, con apps separadas para comensal y admin
- [0003](docs/adr/0003-generar-al-publicar-un-menu-combinado-por-sucursal.md) Menú ya combinado por sucursal al publicar
- [0004](docs/adr/0004-procesar-la-medicion-con-cola-y-worker.md) Medición por cola y worker, con agregados por hora
- [0005](docs/adr/0005-retener-eventos-crudos-90-dias-y-agregados-sin-limite.md) Crudos 90 días, agregados sin límite
- [0006](docs/adr/0006-optimizar-medios-en-worker-y-servirlos-desde-almacenamiento-de-objetos.md) Medios: worker con `ffmpeg` y almacenamiento de objetos
- [0007](docs/adr/0007-usar-cuenta-global-de-miramenu-para-el-comensal.md) Cuenta global del comensal; el negocio solo ve su nombre
- [0008](docs/adr/0008-moderar-comentarios-antes-de-mostrarlos.md) Moderación previa de comentarios
- [0009](docs/adr/0009-construir-todo-en-nestjs-sin-python.md) Todo en NestJS, sin Python
- [0010](docs/adr/0010-usar-en-el-qr-un-enlace-corto-independiente-del-subdominio.md) QR con enlace corto independiente del subdominio
- [0011](docs/adr/0011-cerrar-la-entrada-como-abandono-al-ocultarse-la-pagina.md) Abandono al ocultarse, `sendBeacon` e IndexedDB
- [0012](docs/adr/0012-mantener-la-cola-de-medicion-en-redis-con-aof-y-noeviction.md) Cola de medición en Redis con AOF, `noeviction` y tope
- [0013](docs/adr/0013-sumar-al-agregado-en-la-misma-transaccion-del-insert.md) Agregado en la misma transacción que el insert
- [0014](docs/adr/0014-particionar-eventos-por-dia-y-retener-con-drop.md) Evento particionado por día, retención por `DROP`
- [0015](docs/adr/0015-generar-version-nueva-del-menu-cuando-un-medio-queda-listo.md) Medio listo → versión nueva del menú
- [0016](docs/adr/0016-servir-menu-y-qr-desde-cache-si-cae-postgres.md) Menú y QR desde caché si cae Postgres
- [0017](docs/adr/0017-usar-cliente-de-redis-para-cache-aparte-del-de-la-cola.md) Cliente de Redis de caché aparte del de la cola
- [0018](docs/adr/0018-redirigir-el-qr-con-302-sin-cache-y-subdominios-alias.md) QR con 302 sin caché; subdominios viejos como alias
- [0019](docs/adr/0019-aislar-negocios-con-chequeo-por-modulo-y-404.md) Aislamiento: chequeo por módulo, 404 y prueba de rutas
- [0020](docs/adr/0020-dar-acceso-desde-superadmin-y-admin-restaurante.md) Quién da acceso; superadmin solo en la semilla
- [0021](docs/adr/0021-limitar-intentos-de-login-sin-bloquear-la-cuenta.md) Límite de intentos de login sin bloquear la cuenta
- [0022](docs/adr/0022-descartar-eventos-de-platillos-fuera-del-menu.md) Descartar eventos de platillos fuera del menú
- [0023](docs/adr/0023-invitar-admins-con-enlace-de-un-solo-uso.md) Invitación de admin con enlace de un solo uso
- [0024](docs/adr/0024-separar-la-logica-del-frontend-en-paquetes-sin-dom.md) Lógica del frontend en paquetes sin DOM
- [0025](docs/adr/0025-usar-typeorm-con-migraciones-revisadas-a-mano.md) TypeORM, con particiones y esquemas en migraciones a mano

## Notas / gotchas

- Los scripts `test*` de `apps/api` llaman a `./node_modules/jest/bin/jest.js`, pero npm workspaces instala jest en el `node_modules/` de la raíz y fallan. Usa los comandos de arriba hasta corregir los scripts.
- `npx jest` sin `--experimental-vm-modules` falla al cargar Nest: sus paquetes son solo ESM y el API es CommonJS.
- `apps/api/.oxlintrc.json` apaga `typescript/no-explicit-any`, en contra de la regla de evitar `any`.
- `apps/api/AGENTS.md` (del CLI de Nest) sugiere NestJS Observe y `npm run deploy` (`nest deploy`, `@nestjs/mau`): son servicios de pago y despliegan hacia fuera. No se usan (baseline §6.1).
- Las reglas del kit dan por hecho piezas no instaladas ni decididas: Tailwind, shadcn/ui, TanStack Query y Zustand en el frontend; `class-validator` y Joi en el API.
- Solo hay hook `commit-msg` (commitlint); no hay `pre-commit` con lint-staged.
- Un solo Redis con `noeviction`: al llenarse rechaza escrituras en vez de expulsar claves, así que toda clave de caché, límite o código lleva vencimiento.

## Pendiente de confirmar

- Canal de códigos (WhatsApp o SMS) y su proveedor; proveedor de correo; almacenamiento de objetos y CDN; herramienta del proxy de entrada; nube y región de producción.
- Supuestos del diseño que condicionan código: tope de la cola de 15 min, caché de 24 h, espera de caché de ~100 ms, eventos hasta 7 días tarde, login cerrado si cae Redis, ~100 KB por menú, negocios que no se registran solos.
- El diseño dice "código cifrado" y "token cifrado": confirmar si es un hash (no reversible), lo usual para códigos y tokens de un solo uso.
- Cómo corren los workers: se infiere que comparten el código de `apps/api` con otro punto de entrada; falta decidirlo.
- Sesión del admin (cookie o token), librería de colas (BullMQ es el default del kit) y de validación.
- Retención de los datos de comensales frente a la ley mexicana de datos personales (RNF-07).
- Versión de Node objetivo y runner de tests del frontend.
- Nombres del glosario y de las rutas en inglés (propuestos al trasladar el diseño).
