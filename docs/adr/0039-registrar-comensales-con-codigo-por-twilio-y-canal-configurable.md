# ADR-0039: Registrar comensales con un código por Twilio, con el canal configurable

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisiones tomadas al planear la fase 3 (Comensales); concreta ADR-0007 y el flujo "registro con código" del diseño

## Contexto

El diseño pide validar el celular del comensal con un código por WhatsApp o SMS, pero dejaba el canal sin elegir. También pide:

- limitar los envíos por celular y por dispositivo, porque cada uno cuesta;
- esperar 5 s al proveedor y, si no responde, consultar el estado del envío por su id antes de reenviar;
- dejar que el comensal pida otro código a los 60 s;
- guardar el aviso `ComensalRegistrado` en la misma transacción que el registro.

Faltaba decidir:

- el proveedor;
- cómo se conoce el estado de un envío cuyo resultado se ignora;
- dónde viven el código y la sesión del comensal registrado;
- cómo leen los demás contextos el aviso.

Atributos en juego (ISO/IEC 25010): seguridad (fuerza bruta, CSRF, datos personales), fiabilidad (proveedor lento o caído, Redis caído) y adecuación funcional (una cuenta para todos los negocios).

## Decisión

- **Canal y proveedor:**
  - `VERIFICATION_CHANNEL=whatsapp|sms` elige un canal para todos los negocios.
  - Los dos canales salen por la API de mensajes de Twilio: el canal solo cambia la dirección (`whatsapp:+52…` o `+52…`).
  - El texto vive en una plantilla de Content de Twilio (`TWILIO_CONTENT_SID`, con el código en la variable `1`). En WhatsApp es la plantilla de autenticación de Meta. Así ningún texto para el comensal queda en el código.
  - El API habla con Twilio por un puerto propio, `VerificationSender`, con `fetch` y sin SDK, así que otro proveedor sería un adaptador más.
- **Id propio de cada envío:**
  - Cada envío lleva un `sendId` nuestro en la URL de `StatusCallback`.
  - Twilio manda sus reportes de entrega firmados (`X-Twilio-Signature`). La firma se valida contra la URL configurada, nunca contra el `Host` de la solicitud. El algoritmo se prueba contra el ejemplo de la documentación de Twilio.
  - Así, el estado de un envío sin respuesta se conoce después, aunque no haya llegado el id de mensaje de Twilio.
- **Resultado del envío, con un tope de 5 s** (`VERIFICATION_PROVIDER_TIMEOUT_MS`):
  - Aceptado: 202 `sent`.
  - Rechazado por el número (no es celular, no tiene WhatsApp…): 422 `PHONE_NOT_REACHABLE`.
  - Error del proveedor, o una conexión que no llegó a abrirse: 503 `CODE_PROVIDER_UNAVAILABLE`.
  - Sin respuesta a tiempo, o una conexión que se cayó ya abierta: 202 `unconfirmed`. El código queda válido porque pudo llegar, y **nunca se reenvía solo**: costaría doble y llegarían dos códigos.
- **Consultar antes de reenviar:**
  - Si el comensal pide otro código antes de 60 s, se consulta el estado del envío anterior por su id: lo que dijeron los reportes y, si su estado aún no es final y se conoce su id de mensaje, `GET /Messages/{sid}`.
  - Si falló o no se entregó, se puede pedir otro de inmediato; si no, 429 con `Retry-After`.
  - Un código nuevo no anula los anteriores mientras sigan vigentes (hasta tres), así que un mensaje atrasado trae un código que funciona.
- **Código:**
  - 6 dígitos de `crypto.randomInt`, vigente 10 min, con 5 intentos y de un solo uso.
  - Vive en Redis como HMAC con `DINER_CODE_SECRET`, ligado al celular. Las claves usan un HMAC del celular, nunca el número.
  - Validar cuenta el intento y consume el código en un solo script de Lua, así que dos solicitudes nunca usan el mismo código ni el mismo intento.
  - Si cae Redis, el registro se cierra: 503 `REGISTRATION_UNAVAILABLE`.
- **Límites de envío:**
  - 5 al día por celular, 10 al día por dispositivo y 30 por hora por IP. El id del dispositivo lo manda el cliente, así que el de IP es el que frena a quien lo cambia.
  - Solo celulares de México (`+52` y 10 dígitos), en una regla del contrato lista para más países (RNF-06). Eso también evita el fraude con SMS caros al extranjero.
- **Cuenta y dispositivo:**
  - Una cuenta por celular (`UNIQUE (phone)`). Validar un celular conocido vuelve a entrar y actualiza el nombre.
  - El id del dispositivo lo genera la PWA (IndexedDB) y llega en `X-Device-Id`. Al validar, el dispositivo queda ligado a la cuenta, y si era de otra, pasa a la nueva.
- **Aviso `DinerRegistered` (outbox):**
  - Se escribe uno por cada dispositivo que pasa a una cuenta, en la misma transacción.
  - El rol de `diners` no puede modificar ni borrar los avisos.
  - Su posición es un `bigserial` escrito bajo `pg_advisory_xact_lock`, así que las posiciones se confirman en orden. Interacciones leerá "después de la posición N" (`DinerRegistrations.after`) y guardará la última que procesó, sin saltarse ninguna.
- **Consentimiento:** al validar se guarda el aviso de privacidad (`privacy_notice`) con su versión. La versión que manda la PWA debe ser la vigente (`PRIVACY_NOTICE_VERSION`); si no, 409 `PRIVACY_NOTICE_OUTDATED`. Las ofertas (`offers`) son opcionales. Clave `(diner_id, kind)`.
- **Sesión del comensal:**
  - Token opaco en la cookie `__Host-miramenu_diner` (`HttpOnly`, `Secure`, `SameSite=Strict`), con su hash SHA-256 en Postgres, como la del admin (ADR-0028).
  - Dura 90 días (`DINER_SESSION_DAYS`), sin límite por falta de uso.
- **Origen:** `PublicSiteOriginGuard` solo acepta escrituras cuyo `Origin` sea `PUBLIC_SITE_URL` o un subdominio suyo, con el mismo esquema y puerto. Lo usan pedir y validar el código y cerrar la sesión.
- **Contratos para otros contextos** (`modules/diners/index.ts`):
  - `DinerIdentityGuard` y `RegisteredDinerGuard`, con `@CurrentDiner()` y `@RegisteredDiner()`: identificar al comensal, anónimo o registrado;
  - `DinerDirectory.publicNames`: solo el nombre;
  - `DinerRegistrations.after`: el aviso.
- **Local y CI:** un simulador de Twilio en `compose.yaml` (`config/twilio-simulator/server.mjs`, solo `node:http`). Implementa lo que el API usa, y permite leer los mensajes y fijar el comportamiento de cada número: entregar, tardar, rechazar, fallar o caer. Ningún código sale de la máquina.

## Alternativas consideradas

- **Meta (WhatsApp) y Twilio (SMS):** la tarifa de WhatsApp de Meta sin intermediario, pero dos cuentas y dos API, y el estado de WhatsApp solo llega por webhook.
- **Infobip para los dos:** acepta un id propio en cada envío, pero WhatsApp no tiene consulta de estado y cobra un margen sobre Meta.
- **Twilio Verify:** Twilio genera y valida el código, pero el diseño guarda el código en Redis y decide los límites; además, ata la validación al proveedor.
- **Reenviar solo tras un timeout:** el comensal no tendría que pedirlo, pero un envío sin respuesta pudo haber salido, y se cobraría y llegaría dos veces.
- **Un solo código vigente:** más simple, pero un mensaje atrasado traería un código ya inválido.
- **Una cola para el aviso:** se lo llevaría a Interacciones sin que pregunte, pero habría que escribir en Redis fuera de la transacción del registro. La tabla con posición se queda en la transacción y no pierde nada.

## Consecuencias

- **Positivas:**
  - Ningún envío se repite a ciegas.
  - El estado de cada envío se puede comprobar por su id, aunque el proveedor no haya respondido.
  - Redis no guarda códigos ni celulares legibles.
  - El aviso nunca se pierde ni se duplica por un mismo dispositivo.
  - Cambiar de canal es una variable.
- **Negativas y riesgos aceptados:**
  - Twilio cobra un margen sobre la tarifa de WhatsApp de Meta.
  - El adaptador se probó contra el simulador, no contra Twilio. Antes de producción hay que probarlo con una cuenta real, un remitente de WhatsApp aprobado y las plantillas de Content.
  - El estado `failed` solo se conoce si llega el reporte, o si Twilio dio el id del mensaje y responde a la consulta; si no, el comensal espera los 60 s.
  - La cookie vive en el host del API. Con un solo host de API sirve en todos los restaurantes. Si el proxy pusiera el API en cada subdominio, el comensal validaría una vez por restaurante, con la misma cuenta. Se confirma al elegir el proxy, junto con CORS para los subdominios de la PWA.
  - El límite por celular deja que alguien agote los envíos del día de un número ajeno; es el costo de cuidar el gasto.
  - Revocar el consentimiento y los derechos ARCO quedan pendientes de la revisión legal (RNF-07).
