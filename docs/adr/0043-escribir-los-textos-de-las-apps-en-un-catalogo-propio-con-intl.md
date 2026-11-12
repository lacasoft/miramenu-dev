# ADR-0043: Escribir los textos de las apps en un catálogo propio y tipado, con `Intl` para los formatos

- Estado: Aceptado
- Fecha: 2026-11-12
- Decisores: creador de Miramenu
- Fuente: plan de la fase 6 (PWA del comensal), aprobado el 2026-11-12

## Contexto

La baseline prohíbe textos visibles escritos dentro de los componentes: todos van por un sistema de traducción. Hoy solo hay español de México, pero el producto debe poder ir a otras regiones (RNF-06). Los precios se guardan en centavos con su moneda y hay que mostrarlos según el país.

La demo resolvió los textos con un catálogo propio y una función `t()`, sin librería. Con ADR-0024, React Native podría reutilizar el catálogo si vive en un paquete sin DOM.

Atributos en juego (ISO/IEC 25010): flexibilidad (otras regiones), mantenibilidad (un texto se cambia en un solo lugar) y capacidad de interacción.

## Decisión

- **Paquete `@miramenu/i18n`, sin DOM.**
  - `createTranslator(catalog)` devuelve el `t()` de cada app.
  - Las **llaves y los `{placeholders}` se comprueban al compilar**: pedir una llave que no existe u olvidar un valor es un error de TypeScript.
  - Los valores se insertan como texto, nunca como patrón.
- **Un catálogo por superficie, en el mismo paquete.** El del comensal es `src/diner/es-MX.ts`; el del admin llegará en la fase 7. Otra región sería otro archivo con las mismas llaves.
- **Formatos con `Intl`, que viene en el navegador y en Node.**
  - `formatPrice(minorUnits, currency, locale)` usa la unidad menor de cada moneda según `Intl`: el yen no se divide entre 100.
  - Las fechas llegarán cuando una pantalla las muestre.
- **Las apps solo llaman a `t()`.** El título del documento también sale del catálogo.

## Alternativas consideradas

- **i18next o FormatJS (react-intl):**
  - A favor: resuelven plurales, carga de idiomas y extracción de textos.
  - En contra: son dependencias grandes para un solo idioma, y sus llaves no se comprueban al compilar sin más herramientas.
  - Si llegan otras regiones con plurales complejos, se puede cambiar sin tocar las pantallas: solo cambia la implementación de `t()`.
- **Textos dentro de cada componente:** prohibido por la baseline, y obligaría a reescribir todas las pantallas para otra región.

## Consecuencias

- **Positivas:**
  - Ninguna dependencia nueva.
  - Errores de texto atrapados al compilar.
  - El catálogo se comparte con una futura app nativa.
- **Negativas y riesgos aceptados:**
  - Los plurales y el género se escriben a mano en cada texto. Si se vuelven comunes, `Intl.PluralRules` está disponible sin dependencias.
  - Una llave sin usar no se detecta sola.
