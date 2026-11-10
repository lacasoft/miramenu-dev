# ADR-0036: Publicar el menú en dos instantáneas, con choques confirmados, versión del borrador e idempotencia

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la fase 2 (Catálogo); completa ADR-0003

## Contexto

ADR-0003 fija que al publicar se genera un menú ya combinado por sucursal. El diseño agrega que "publican ambos: el negocio publica el menú base y cada sucursal publica sus ajustes, por separado", que ningún borrador llega al comensal, y que si un cambio del menú base choca con un ajuste de sucursal, la API devuelve las sucursales afectadas antes de guardar y el ajuste solo se pisa si el negocio confirma "con la lista que vio".

Si el menú combinado se armara con los borradores vigentes, publicar una sucursal sacaría al comensal los cambios que el negocio todavía no publica, y al revés.

Atributos en juego (ISO/IEC 25010): adecuación funcional (corrección), fiabilidad (integridad ante reintentos y concurrencia) y seguridad (aislamiento entre negocios).

## Decisión

- **Dos instantáneas fijas.** Publicar el menú base guarda una instantánea del negocio (`published_base`: categorías, platillos base y perfil). Publicar una sucursal guarda la suya (`published_branch`: ajustes, platillos propios y perfil propio). El MenúPublicado de cada sucursal combina la última de cada una (`domain/compose-menu.ts`), nunca un borrador.
- **Quién genera menús.** La publicación del negocio genera uno para cada sucursal, en una sola transacción. La de una sucursal genera solo el suyo, sobre la última base publicada; si el negocio nunca publicó, responde 409 `BASE_MENU_NOT_PUBLISHED`. Una sucursal creada después recibe su menú en la siguiente publicación, del negocio o suya.
- **Choques.** Hay choque cuando cambia el precio base de un platillo que la sucursal re-precia, salvo que el precio de la sucursal sea igual al nuevo (`price_changed`), o cuando se quita un platillo que la sucursal ajustó (`dish_removed`). Cuentan tanto el borrador de la sucursal como lo que ya publicó.
  - `GET …/menu-draft` del negocio devuelve los choques vigentes.
  - Para publicar, `confirmedConflicts` debe contener todos. Si aparece uno nuevo después de la revisión, la respuesta es 409 `PUBLICATION_CONFLICTS` y no se guarda nada.
  - Al confirmar, el precio en choque vuelve al precio base (disponible y oculto se conservan) y el ajuste de un platillo quitado desaparece. El cambio se aplica en el borrador de la sucursal, cuya versión sube, y en una versión nueva de lo que la sucursal publicó, copiada de la última y nunca del borrador.
- **Versión del borrador.** El negocio y cada sucursal tienen una fila de estado con su `draft_version`.
  - Cada edición la sube primero, dentro de su transacción.
  - Publicar con una versión que ya no es la vigente responde 409 `DRAFT_CHANGED`.
  - El documento del borrador se lee en `REPEATABLE READ`, para que su versión corresponda a su contenido.
- **Idempotencia.** Toda publicación exige el header `Idempotency-Key` (16 a 128 caracteres seguros para URL).
  - La clave vale por alcance: `(business | branch, id, clave)`.
  - Un reintento recibe el resultado guardado de la primera publicación.
  - La misma clave con otro cuerpo responde 422 `IDEMPOTENCY_KEY_REUSED`.
- **Concurrencia.** Publicar el negocio bloquea su fila de estado (`FOR UPDATE`) y luego las de sus sucursales, en orden. Publicar una sucursal toma `FOR KEY SHARE` sobre la del negocio y `FOR UPDATE` sobre la suya. Así, dos publicaciones simultáneas parten de la última versión, la más nueva contiene las dos, y no hay interbloqueos.
- **Lo que se quita.** Categorías y platillos base se marcan como quitados (`removed_at`) en vez de borrarse, porque una sucursal puede seguir teniéndoles un ajuste hasta que el negocio publique. Una categoría con platillos vivos no se quita (409 `CATEGORY_IN_USE`). Un platillo propio va en una categoría del negocio; publicarlo antes de que el negocio publique esa categoría responde 409 `CATEGORY_NOT_PUBLISHED`.
- **Permisos.** Hay un nivel nuevo, `operate`, sobre la sucursal: ajustes, platillos propios, perfil propio y publicación de la sucursal. Lo tienen su admin sucursal, el admin restaurante y el superadmin. El menú base y su publicación siguen siendo `administer` del negocio; el admin sucursal solo puede leerlo.
- **Perfil.** La primera publicación del negocio exige su perfil (409 `PROFILE_REQUIRED`), porque el menú muestra su nombre.
- **Límites.** Como máximo 50 categorías y 300 platillos por negocio, y 100 platillos propios por sucursal (`MENU_LIMITS`). Así el borrador y el menú son un solo documento de ~100 KB y no hace falta paginarlos.
- **Inmutabilidad en la base.** El rol del API no puede modificar ni borrar `publication`, `published_base`, `published_branch` ni `published_menu`.

## Alternativas consideradas

- Combinar los borradores vigentes al publicar: más simple, pero un borrador del negocio llegaría al comensal cuando publica una sucursal.
- Devolver la lista de choques en el cuerpo del 409: el sobre de error del contrato es estricto (`{ code, message, requestId }`), así que la lista sale en el documento del borrador, que la app ya tiene abierto.
- Elegir, para cada choque, entre pisar y conservar: más flexible, pero con más interfaz y más casos sin un pedido real. Si el negocio no quiere pisar, revierte su cambio.
- Clave de idempotencia en el cuerpo: funciona igual, pero el header es la convención de HTTP y no se mezcla con los datos.

## Consecuencias

- Positivas: ningún borrador llega al comensal por ningún camino; cada versión es reproducible y fija; los reintentos y las publicaciones simultáneas no duplican ni pierden cambios.
- Negativas y riesgos aceptados:
  - Una sucursal nueva no tiene menú hasta la siguiente publicación.
  - Cada publicación del negocio guarda una fila de ~100 KB por sucursal, sin retención definida; hay que revisarlo al crecer.
  - La app de admin necesita dos llamadas: leer el borrador con sus choques y luego publicar.
