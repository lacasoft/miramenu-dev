# ADR-0026: Validar con Zod y compartir los contratos en packages/contracts

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la base del backend; el diseño no elegía librería de validación

## Contexto

El API valida en cada frontera: body, params, query y variables de entorno (baseline §6). La PWA y el admin consumen las mismas respuestas, y ADR-0024 pide que estado, cliente del API y tipos vivan en paquetes compartidos sin DOM. La regla del kit para NestJS asume `class-validator`, que valida con clases decoradas que solo existen en el API. Nest 12 trae `StandardSchemaValidationPipe`, que valida con cualquier librería de Standard Schema, sin clases.

Atributos en juego (ISO/IEC 25010): mantenibilidad (un solo contrato) y seguridad (validación en las fronteras).

## Decisión

- Los contratos HTTP se escriben como esquemas **Zod 4** en `packages/contracts`, sin DOM ni APIs de Node. Se compilan a ESM; el API, que es CommonJS, los carga con `require(esm)`.
- El API los valida con `StandardSchemaValidationPipe` (`@Param('id', { schema })`, `@Body({ schema })`). Un fallo responde 400 `VALIDATION_FAILED` con el sobre del contrato, nombrando los campos y nunca sus valores.
- La configuración del API también se valida con Zod al arrancar (`infrastructure/config/environment.ts`), sin `@nestjs/config`: un objeto tipado en lugar de claves de texto.
- Primer contrato: el sobre de error `{ code, message, requestId }`, estricto, para que nada más (un stack, por ejemplo) pueda salir.

## Alternativas consideradas

- `class-validator` (default del kit): solo vive en el API, y las apps tendrían que duplicar los tipos o generarlos de OpenAPI.

## Consecuencias

- Positivas: un contrato que comparten backend y frontend, y tipos inferidos sin duplicar. Sin dependencias extra para validar ni para la configuración.
- Negativas y riesgos aceptados: `packages/contracts` se compila antes que el API (`npm run build:contracts`, que ya llaman `lint` y `test`). La regla del kit sobre `class-validator` no aplica a este repo.
