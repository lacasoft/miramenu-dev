# ADR-0027: Aislar los contextos con un esquema y un rol de Postgres por contexto, en una sola base

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la base del backend; completa ADR-0001

## Contexto

ADR-0001 fija un esquema de Postgres por contexto y pide reglas que impidan que un módulo lea las tablas de otro. Las reglas de dependencias (`.dependency-cruiser.cjs`) ven los imports, pero no el SQL crudo ni `getRepository('Nombre')` con texto. Comensales guarda datos personales; ese límite merece una protección que no dependa de la disciplina. Agregarla ahora, antes de que existan tablas, es lo más barato.

Atributos en juego (ISO/IEC 25010): seguridad (confidencialidad, no repudio de la propiedad de los datos) y mantenibilidad (modularidad comprobada).

## Decisión

- **Una sola base** (`miramenu`), con un esquema por contexto: `business_access`, `catalog`, `diners`, `interactions` y `measurement`.
- **Un rol de Postgres por contexto**, con `CONNECT` a la base, `USAGE` en su esquema y, por privilegios por defecto, `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre sus tablas y uso de sus secuencias. Sin DDL.
- **Un rol dueño** (`miramenu_migrator`) crea los esquemas y las tablas; solo lo usan las migraciones (`npm run db:migrate -w api`), nunca el API.
- **El API abre una conexión por contexto**, con su rol y un `search_path` a su esquema. Un módulo solo llega a sus datos con `TypeOrmModule.forFeature([...], '<contexto>')`.
- En desarrollo y CI, `config/postgres/init-roles.sh` crea los roles; en producción los crea la infraestructura. Las migraciones nunca contienen contraseñas.

## Alternativas consideradas

- Un solo usuario para todos los contextos: más simple, pero el límite se puede saltar con SQL crudo.
- Una base por contexto: aislamiento similar, pero más costo de operación y ninguna ventaja adicional en un monolito modular.

## Consecuencias

- Positivas: leer o escribir el esquema de otro contexto falla en la base con `permission denied` (SQLSTATE 42501). La prueba de integración `apps/api/test/database-isolation.e2e-spec.ts` lo comprueba para cada par de contextos y que ningún rol puede hacer DDL.
- Negativas y riesgos aceptados: 5 pools de conexiones (5 por contexto por defecto, `DB_POOL_MAX_PER_CONTEXT`), y ninguna transacción entre contextos, que el diseño ya prohíbe.
- Pendiente para Medición: crear particiones por día (ADR-0014) es DDL, que su rol no tiene; hay que decidir quién las crea cuando se construya esa fase.
