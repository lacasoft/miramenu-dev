# ADR-0046: Abrir sin red con un service worker propio y la última copia del menú

- Estado: Aceptado
- Fecha: 2026-11-12
- Decisores: creador de Miramenu
- Fuente: plan de la fase 6d, aprobado el 2026-11-12 ("Service worker, sin instalar"); ajustado al implementarlo, como se explica abajo

## Contexto

El diseño pide que un comensal sin red conserve el menú (_Fallas previstas_). Hasta la fase 6d.1, la PWA solo lo conservaba en memoria: si se cerraba la pestaña o se recargaba sin red, no abría. El caso típico es este: el comensal escanea el QR una vez y luego abre la PWA otra vez, sin señal, dentro del restaurante.

La demo (`menu-experience-demo`) tiene un service worker propio, sin dependencias, con la versión calculada del contenido del build. Su menú va dentro del bundle; el de Miramenu viene del API (`GET /resolve` y `GET /branches/:id/menu`).

El plan aprobado ponía en el service worker la app y también esas dos lecturas del API. Al implementarlo aparecieron dos huecos:

- **La primera visita no pasa por el service worker.** Se instala durante esa visita, pero no la controla (ni debe: una versión nueva entra en la siguiente visita, nunca a media visita). El menú de esa visita nunca se guardaría, y justo el caso típico abriría sin menú.
- **TanStack Query detiene las consultas cuando el navegador dice que no hay red** (`networkMode: "online"`, su valor por defecto). La consulta del menú ni siquiera saldría, así que nada podría contestarle con una copia.

Atributos en juego (ISO/IEC 25010): fiabilidad (abrir sin red), eficiencia de desempeño (no competir con la primera tarjeta, RNF-01) y mantenibilidad (sin dependencias nuevas, reglas probadas).

## Decisión

- **El service worker guarda solo la app.** Lo escribimos nosotros (`apps/pwa/src/sw/`), sin dependencias, y se registra solo en el build de producción, después de `load`.
  - **Navegación:** primero la red; sin red, o con el servidor caído (5xx), el `index.html` de su versión, que sirve para cualquier restaurante y ruta (ADR-0029).
  - **Archivos de la app:** primero la caché de su versión, y si falta, la red. Se busca con `ignoreVary`: la caché solo tiene los archivos de esa versión, y un `Vary: Origin` del servidor haría fallar cada búsqueda, porque la página pide su módulo y su CSS con `Origin`.
  - **Nada más:** ni el API, ni los medios, ni las escrituras. Sin red, los medios muestran su espacio vacío, salvo lo que tenga la caché HTTP del navegador.
- **El build arma el service worker.** Un plugin de Vite (`apps/pwa/vite/precache-plugin.ts`) lo compila como una entrada más, con nombre fijo `/sw.js`, y le escribe la lista de archivos y una versión calculada de su contenido, como la demo. El build falla si el worker importa otro chunk (un worker clásico no puede) o si no tiene dónde recibir esa lista.
- **Versiones:** sin `skipWaiting` ni `clients.claim`. Una versión nueva se instala, espera y entra en la siguiente visita; al activarse borra los archivos de las versiones viejas.
- **El último menú lo guarda la página.** El cliente del API marca las solicitudes que admiten una copia (`allowsLastCopy`: solo la resolución y el menú). El transporte de la PWA (`withLastCopy`) guarda su última respuesta buena en Cache Storage (`miramenu-last-copy`) y la devuelve si la red falla o el servidor responde 5xx. Así está desde la primera visita, con o sin service worker. Cualquier otra respuesta, un 404 incluido, es la del API.
- **Las consultas no esperan a que el navegador diga que hay red** (`networkMode: "always"`). Sin red, el transporte contesta con la copia o falla, y las pantallas muestran una u otra cosa: el menú guardado, o "no disponible" con su botón para reintentar, en vez de un skeleton sin fin.
- **Sin manifiesto ni íconos.** La PWA instalable espera a que exista la marca de Miramenu.

## Alternativas consideradas

- **El plan tal cual (el service worker guarda también el API):** deja sin menú la primera visita. Taparlo exigiría `clients.claim` y volver a pedir el menú cuando el service worker toma el control, lo que acopla la página al ciclo de vida del worker.
- **Persistir la caché de TanStack Query** (`@tanstack/query-persist-client`): agrega una dependencia y guarda todo el estado del cliente, no solo lo que tiene sentido ver sin red.
- **La caché HTTP del navegador** (reintentar con `cache: "force-cache"`): no se controla qué conserva ni por cuánto tiempo, y `/resolve` no tiene por qué quedar en ella.
- **Workbox o `vite-plugin-pwa`:** resuelven lo mismo con más superficie y dependencias. La demo ya mostró que bastan unas decenas de líneas.

## Consecuencias

- **Positivas:**
  - Tras una visita con red, la PWA abre sin red con el último menú, incluso si la primera visita fue la única.
  - Las reglas están en código puro y probado (`cache-policy.ts`, `withLastCopy`).
  - El plugin se prueba con builds reales y con el worker ya compilado.
- **Negativas y riesgos aceptados:**
  - La copia puede ser vieja. Sin red, el comensal ve el último menú que cargó, no el vigente, y nada se lo dice todavía: no hay pantalla aprobada para ese aviso.
  - Una versión nueva de la app no llega hasta la siguiente visita. Mientras haya una pestaña abierta, sigue la anterior.
  - Si una versión nueva cambia el contrato del menú, la copia guardada puede no pasar la validación del cliente. Sin red, se verá "no disponible" hasta la siguiente visita con red.
  - **El servidor de la PWA** debe servir `/sw.js` en la raíz y `/index.html` sin redirigir; el proxy de producción todavía no está elegido.
