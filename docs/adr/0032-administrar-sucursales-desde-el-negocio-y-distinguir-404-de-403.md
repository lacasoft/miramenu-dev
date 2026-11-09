# ADR-0032: Administrar las sucursales desde el negocio, y distinguir 404 de 403 en los permisos

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: hueco del diseño detectado al planear la fase 1 (Negocios y acceso); completa ADR-0019 y ADR-0020

## Contexto

El diseño fija quién da de alta negocios (el superadmin) y quién asigna roles (el admin restaurante), pero no quién crea las sucursales, que a su vez traen su QR, su slug y su subdominio propio opcional. ADR-0019 pide responder 404 cuando un objeto no es del actor, para no revelar que existe, pero no dice qué hacer cuando el objeto sí está en su alcance y su rol no alcanza (por ejemplo, un admin sucursal que intenta cambiar la configuración de su propia sucursal).

Atributos en juego (ISO/IEC 25010): seguridad (control de acceso, confidencialidad) y capacidad de interacción (errores comprensibles).

## Decisión

- Las sucursales las crean y administran el **admin restaurante** de su negocio y el **superadmin**: nombre, slug y subdominio propio. Cada sucursal nueva recibe su QR en la misma transacción.
- El **admin sucursal** ve su sucursal y su negocio, pero no cambia la configuración de la sucursal, no crea sucursales ni administra personas.
- El chequeo de permisos (`AccessControl`, contrato "Verificar el permiso") decide en un solo punto:
  - **404** si el objeto está fuera del alcance del actor: otro negocio, u otra sucursal para un admin sucursal, aunque sea del mismo negocio.
  - **403** si el objeto está en su alcance pero su rol no alcanza (admin sucursal sobre la configuración de su sucursal o sobre el equipo de su negocio, o un no superadmin dando de alta un negocio).
- Para una sucursal, el chequeo carga primero su negocio real; nunca confía en el negocio que llega en la solicitud.

## Alternativas consideradas

- Solo el superadmin crea sucursales: centralizado, pero cada sucursal nueva dependería de una persona.
- 404 también dentro del alcance: no revela nada que el actor no sepa ya (es su negocio) y hace más confusos los errores del admin.

## Consecuencias

- Positivas: el negocio crece sin pasar por el superadmin, y un admin sucursal entiende por qué una acción no está permitida sin aprender nada de otros negocios.
- Negativas y riesgos aceptados: dos códigos de rechazo que mantener coherentes. La prueba de aislamiento (`apps/api/test/admin-isolation.e2e-spec.ts`) exige 404 en todas las rutas `/admin` para el admin de otro negocio y el de otra sucursal, y falla si aparece una ruta nueva sin cubrir.
