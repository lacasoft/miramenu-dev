# ADR-0030: Usar SeaweedFS y Mailpit en local, detrás de adaptadores S3 y SMTP

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la base del backend; el diseño deja la nube y los proveedores para producción

## Contexto

El desarrollo es local, con todo en Docker, y los servicios cloud se eligen al ir a producción (diseño, _Restricciones tecnológicas_). El backend necesita almacenamiento de objetos (ADR-0006) y correo (ADR-0023) reales para probar de punta a punta. MinIO, la opción habitual para S3 local, quedó archivado y sin mantenimiento.

## Decisión

- **Puertos en el API:** `ObjectStorage` (`put`, `head`, `publicUrl`, `checkBucket`) y `Mailer` (`send`, `verify`), con adaptadores **S3** (`@aws-sdk/client-s3`) y **SMTP** (`nodemailer`). S3 y SMTP son las interfaces que ofrecen casi todos los proveedores candidatos.
- **En local y CI** (`compose.yaml`):
  - **SeaweedFS** (Apache-2.0) en modo `mini`, con el bucket `media` de lectura anónima y escritura solo con la identidad del API, y la telemetría apagada.
  - **Mailpit** (MIT), que atrapa los correos y los muestra en una interfaz web, sin búsqueda DNS inversa de los clientes.
- Todas las imágenes de `compose.yaml` van fijadas por versión y digest, y sus puertos solo escuchan en `127.0.0.1`.

## Alternativas consideradas

- MinIO: archivado y sin mantenimiento.
- RustFS (Apache-2.0): activo, pero más nuevo; SeaweedFS tiene más años en producción.
- Sistema de archivos local sin S3: obligaría a reescribir el adaptador al elegir nube.

## Consecuencias

- Positivas: los tests de integración usan S3 y SMTP reales, el mismo código corre en local y en producción, y cambiar de proveedor es configuración.
- Negativas y riesgos aceptados: SeaweedFS no es el proveedor de producción, así que las diferencias de compatibilidad S3 aparecerán al elegir nube. Redis 8 tiene licencia triple (RSALv2, SSPLv1 o AGPLv3): sirve como contenedor local; para producción, considerar Valkey (BSD).
