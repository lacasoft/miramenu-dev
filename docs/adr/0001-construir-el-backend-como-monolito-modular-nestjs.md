# ADR-0001: Construir el backend como monolito modular en NestJS, con un esquema de Postgres por contexto

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-01

## Contexto

El dominio se divide en cinco contextos con reglas y datos propios: Negocios y acceso, Catálogo, Comensales, Interacciones y Medición (diseño, _API y modelo de datos → Contextos y propiedad_). Dos son límites críticos: Comensales guarda datos personales y Negocios y acceso decide los permisos. La persona fijó como restricciones un monorepo, NestJS y un monolito modular con bounded contexts bien definidos (_Decisiones → Restricciones tecnológicas_).

La carga del primer año (~32 sesiones/s en pico, _Escala y supuestos_) no obliga a escalar ningún contexto por separado. Atributos en juego (ISO/IEC 25010): mantenibilidad (modularidad), seguridad (confidencialidad de datos personales) y operación sencilla.

## Decisión

- Un solo backend NestJS (`apps/api`) con un módulo por contexto.
- Un esquema de Postgres por contexto; cada módulo lee y escribe solo el suyo.
- Ningún dato se escribe desde dos contextos. Los contextos se usan entre sí por los contratos que expone cada uno o por avisos, como `ComensalRegistrado`, que procesa el contexto dueño de los datos.
- Los límites se protegen con reglas de dependencias en el código que comprueben que ningún módulo lee las tablas de otro.

## Alternativas consideradas

- Microservicios: varios despliegues, red entre servicios y consistencia distribuida que operar, sin una necesidad de escala que lo justifique.

## Consecuencias

- Positivas: límites claros entre contextos con un solo despliegue que operar; transacciones locales dentro de cada contexto.
- Negativas y riesgos aceptados: todo escala junto. Los límites dependen de que las reglas de dependencias se cumplan: un `@Module` de Nest o una carpeta no impiden un import directo ni una consulta al esquema de otro contexto.
- Revisar si un contexto necesita escalar o desplegarse por separado (por ejemplo, Medición, con ~7,000 eventos/s a 3 años).
