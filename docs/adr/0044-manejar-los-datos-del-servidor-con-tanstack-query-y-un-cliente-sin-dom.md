# ADR-0044: Manejar los datos del servidor con TanStack Query y un cliente del API sin DOM

- Estado: Aceptado
- Fecha: 2026-11-12
- Decisores: creador de Miramenu
- Fuente: plan de la fase 6 (PWA del comensal), aprobado el 2026-11-12; cierra "TanStack Query y Zustand (sin decidir)" de las notas

## Contexto

La PWA lee el menú, los conteos y los comentarios, y escribe likes y comentarios. Las reglas del kit separan el estado del servidor del estado local de la pantalla. ADR-0024 pide que las llamadas al API vivan en un paquete sin DOM, que el admin también usará. Los contratos ya existen como esquemas de Zod en `@miramenu/contracts` (ADR-0026).

Hay requisitos que tocan el manejo de esos datos:

- **RNF-01:** primera tarjeta en ≤3 s.
- **RNF-04:** un like puede tardar hasta 30 s en verse en otros celulares.
- **Sin red:** el comensal conserva el menú ya cargado.
- **Like optimista**, que se ve al instante.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño, fiabilidad (reintentos y datos ya cargados) y mantenibilidad.

## Decisión

- **`@miramenu/api-client` (sin DOM)** hace las llamadas.
  - Recibe por inyección un `Transport` con la forma de `fetch`: la web pasa el suyo y una app nativa pasaría otro.
  - Valida cada respuesta con su esquema de `@miramenu/contracts`: una respuesta fuera del contrato es un error, nunca datos en pantalla.
  - Convierte el sobre `{ code, message, requestId }` en un `ApiError` tipado. Distingue `http`, `network` y `unexpected` (una página de error del proxy, por ejemplo), y nunca muestra el cuerpo de una respuesta inesperada.
  - Las **lecturas no llevan headers propios**: un `GET` sin ellos no necesita preflight de CORS (ADR-0045), lo que ahorra una ida y vuelta en la primera carga.
  - El menú se revalida con el caché del navegador, que ya usa su `ETag` (`Cache-Control: public, no-cache`). El cliente no guarda `ETag` por su cuenta: eso obligaría a mandar `If-None-Match`, que sí provoca preflight.
- **TanStack Query (`@tanstack/react-query` 5.105.3)** en las apps maneja caché, carga, reintentos y, en 6c, las mutaciones optimistas.
  - Reintenta solo lo pasajero (`isTemporary`: sin red, 503, un 5xx del proxy) hasta 2 veces. Nunca reintenta un 404.
  - Un menú ya cargado se sigue mostrando aunque falle una actualización.
- **Estado local de la pantalla** (densidad de la retícula, platillo activo): estado de React. Zustand queda descartado mientras React baste.

## Alternativas consideradas

- **Llamadas y caché a mano en cada pantalla:** es repetir lo que TanStack Query ya resuelve (deduplicar, reintentar, invalidar, optimismo), con más errores.
- **SWR:** más chico, pero con menos soporte para mutaciones optimistas y reversión.
- **Que el cliente guarde el `ETag` del menú:** útil fuera del navegador, pero en la web fuerza un preflight en cada carga. Se puede agregar al `Transport` nativo si algún día hace falta.

## Consecuencias

- **Positivas:**
  - Las pantallas no manejan reintentos ni caché.
  - El admin reutiliza el cliente.
  - Un cambio de contrato rompe la compilación o se rechaza en tiempo de ejecución, nunca se pinta mal.
- **Negativas y riesgos aceptados:**
  - Una dependencia más en la app. La versión 5.107.1 tenía 5 días y se eligió la 5.105.3 por la regla de los 7 días.
  - Zod viaja en el bundle de la PWA para validar respuestas: unos 110 KB gzip en total en 6a. Hay que vigilarlo con RNF-01.
