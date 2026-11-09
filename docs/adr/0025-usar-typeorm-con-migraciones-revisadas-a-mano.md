# ADR-0025: Usar TypeORM, con las particiones y los esquemas en migraciones revisadas a mano

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu
- Fuente: decisión tomada al trasladar el diseño a `CLAUDE.project.md`; el diseño no elegía ORM

## Contexto

El diseño fija Postgres con un esquema por contexto (ADR-0001), la tabla Evento particionada por día con clave única `(día, eventoId)` y retención por `DROP` (ADR-0014), claves foráneas que incluyen negocioId en Catálogo (ADR-0019), una transacción por lote de medición (ADR-0013) y versiones con control de concurrencia en el menú publicado (ADR-0003, ADR-0015). No elegía ORM. La regla del kit para NestJS asume TypeORM, y Nest tiene integración de primera parte (`@nestjs/typeorm`).

Atributos en juego (ISO/IEC 25010): mantenibilidad.

## Decisión

- TypeORM como ORM del API. Cada entidad declara el esquema de su contexto.
- Migraciones generadas y revisadas a mano; nunca `synchronize: true`.
- Lo que el modelo de entidades no expresa (tablas particionadas, creación anticipada y `DROP` de particiones, claves foráneas compuestas si hiciera falta) va en migraciones SQL escritas a mano.

## Alternativas consideradas

- Drizzle: más cercano a SQL, pero fuera del playbook del kit; se eligió TypeORM.

## Consecuencias

- Positivas: coherente con la regla del kit y con la integración de primera parte de Nest.
- Negativas y riesgos aceptados: las particiones y parte del esquema viven solo en las migraciones, no en las entidades; el esquema real se revisa en las migraciones.
- Revisar si la mayor parte del esquema termina en SQL escrito a mano.
