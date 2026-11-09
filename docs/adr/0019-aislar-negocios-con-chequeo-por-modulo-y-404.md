# ADR-0019: Aislar los negocios con un chequeo por módulo, 404 y una prueba de todas las rutas del admin

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-19

## Contexto

RNF-05: cada negocio y cada sucursal ve solo sus datos, siempre; el superadmin es la única excepción. Dentro de cada esquema los negocios comparten tablas, así que el esquema por contexto (ADR-0001) no los aísla. El riesgo es olvidar un chequeo, sobre todo en rutas con solo el id de un objeto y con ids en el cuerpo (revisión con IA del 2026-11-09, aislamiento entre negocios).

Atributos en juego (ISO/IEC 25010): seguridad (confidencialidad y control de acceso).

## Decisión

- Cada módulo verifica en un solo punto, antes de actuar: obtiene el negocio y la sucursal del objeto (de la ruta o cargándolo) y llama al contrato "Verificar el permiso" de Negocios y acceso. Si no corresponde, responde 404, para no revelar que el objeto existe.
- El superadmin pasa por el mismo chequeo, que lo deja pasar de forma explícita.
- Los ids que llegan en el cuerpo se comprueban del mismo negocio; en Catálogo, con claves foráneas que incluyen negocioId.
- Una prueba automática recorre todas las rutas del admin con un usuario de otro negocio y otro de otra sucursal, y exige 404.

## Alternativas consideradas

- Row-Level Security en Postgres por negocioId: se descartó por ahora a favor de una solución más barata.

## Consecuencias

- Positivas: barato, y el límite queda comprobado por la prueba automática.
- Negativas y riesgos aceptados: depende de que la prueba cubra cada ruta nueva; Postgres no frena un filtro olvidado.
- Revisar si aparece una fuga entre negocios o si la prueba deja de cubrir todas las rutas; Row-Level Security sería la siguiente capa.
