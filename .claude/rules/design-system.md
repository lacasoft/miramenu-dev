---
paths:
  - "apps/pwa/**"
  - "apps/admin/**"
  - "packages/**"
---

# Sistema de diseño gastronómico v1.0 — tokens y reglas visuales

Fuente: `docs/diseno-visual/sistema-de-diseno-gastronomico-v1.0.md` y `docs/diseno-visual/GUIA-VISUAL.png` (28 de octubre de 2026), traídos de la demo `menu-experience-demo`. Esto es una **especificación**, no una biblioteca de componentes: hay que construir los componentes.

- **Los valores viven en `packages/tokens/src/index.ts`.** Los componentes usan los roles, nunca un hex. El CSS de `packages/tokens/generated/` se regenera (`npm run build -w packages/tokens`), no se edita a mano.
- **La geometría de los iconos vive en `packages/icons`.** Cada plataforma la dibuja con su renderer.
- **Base de estilos de las apps: CSS Modules** (`*.module.css`) que consumen las variables de `@miramenu/tokens/tokens.css` por rol (ADR-0031). No se usa la base de la demo (Tailwind v4, radix-ui y cva) ni la de la regla del kit (Tailwind y shadcn/ui).

## Color

Se consume **por rol** (superficie, texto, acción, borde, foco, estado), nunca repitiendo hex en cada pantalla. Valores confirmados contra los píxeles de la guía:

| Token           | Hex       | Uso                                                  |
| --------------- | --------- | ---------------------------------------------------- |
| Tinta           | `#0B0D0C` | Base pública (negro mineral).                        |
| Marfil          | `#F8F5EF` | Texto sobre base oscura.                             |
| Champán         | `#D7C49A` | Acento preciso; no es un borde permanente.           |
| Tinta de acento | `#544622` | Acción primaria. Es café oliva en la guía, no verde. |
| Mineral         | `#EEEDE7` | Fondo claro del dashboard.                           |
| Luz puntual     | `#8DD6CD` | Señal de atención localizada y **opcional**.         |

- Éxito, advertencia, peligro e información son independientes del color de marca y van acompañados de texto o icono. El estado de un control nunca depende solo del color.
- La paleta no autoriza texto claro sobre cualquier video: hay que verificar el fondo compuesto y subir opacidad o caer al sólido si no se lee.

## Tipografía

Inter, con fallback de sistema mientras no se registren las fuentes. **No** se usa serif para el detalle editorial. Escala tamaño/interlineado: display 36/42 · título de pantalla 28/34 · sección 22/28 · tarjeta 18/24 · cuerpo 16/24 · etiqueta 14/20 · metadato 12/16. Lo esencial no baja de 14; el cuerpo largo usa 16. Las acciones y los textos secundarios no se vuelven tenues.

## Geometría

- Espacio en escala de 4: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Margen móvil de referencia 16. Más densidad no reduce las áreas de los controles.
- Radios por función: 12 campo · 24 módulo · 32 panel · cápsula. No todo es cápsula.
- Iconos dibujados en viewBox 24 × 24 con trazo coherente. El objetivo táctil es **48** y lo aporta el componente interactivo, no el dibujo.
- Elevación de tres niveles: contenido, controles superpuestos y superficie de lectura o diálogo. No se apilan sombras con resplandores.

## Materiales

Tres, y se eligen por función: **cristal editorial perla** (módulos informativos sobre imagen), **cristal ahumado funcional** (navegación, selector, barras de acción) y **superficie sólida de lectura** (ingredientes, formularios, errores). No es Liquid Glass de Apple ni se aplica a toda la pantalla. En web, desenfoque de fondo **siempre con alternativa sólida**: si hay transparencia reducida, soporte insuficiente o rendimiento degradado, se cae al sólido sin perder acciones ni información.

## Iconos y acciones

Corazón = Me gusta; marcador = Guardar (Miramenu no tiene Guardar por ahora). "Ver detalle" es un botón visible, no una zona invisible. El selector de densidad usa rectángulo vertical / cuatro celdas / nueve celdas, **sin números visibles**, con nombre accesible y estado seleccionado.

## Retículas

Feed, dos y tres columnas son el mismo patrón, y Miramenu incluye las tres; la vista principal es la de dos columnas (`design.md`, 2026-11-09). Cambiar de densidad conserva el orden por filas, el producto activo, los filtros y el restaurante; no reinicia la colección. Las retículas muestran portadas, nunca varios videos a la vez. Cada celda lleva su corazón, y "Ver detalle" va en una barra contextual del producto seleccionado. En dos columnas caben nombre y datos breves; en tres manda la imagen. La densidad no reduce el área táctil ni vuelve ilegibles los títulos.

## Movimiento

Respuesta breve 120 ms · transición habitual 180–240 ms · entrada editorial hasta 320 ms. Son duraciones de animación, no retardo: RNF-02 exige que el feedback **empiece** en ≤100 ms. El contenido no espera a la animación. Con reducción de movimiento, cambio directo o fundido breve. El sonido nunca se activa de sorpresa.

## Accesibilidad

WCAG 2.2 AA: 4.5:1 en texto normal, 3:1 en texto grande y **3:1 para la información visual que identifica controles y estados** frente a colores adyacentes. No se valida midiendo solo la capa semitransparente: hay que probar sobre fotogramas claros, oscuros y de mucho detalle.

## Dashboard: composición de referencia

Referencia aparte de las cuatro pantallas del feed (`docs/diseno-visual/dashboard.png`, solo en local: es de terceros y no se versiona; lo que hace falta ya está medido aquí), para la app de admin. Se toma **la composición, no el contenido**: el referente es un panel financiero y aquí no hay dinero que mostrar.

Retícula, medida sobre la referencia: **cuatro columnas** de ancho igual con una separación estrecha y constante, más el riel lateral fuera de la retícula. La primera fila son cuatro KPI de una columna cada uno y poca altura. Las filas siguientes son **2 + 1 + 1**: una tarjeta ancha de dos columnas a la izquierda y dos angostas a la derecha, todas de la misma altura, que es entre dos y tres veces la de un KPI. La cabecera ocupa el ancho completo por encima de todo: identidad y saludo a la izquierda, alineados con el inicio de la primera columna, y buscador más botones circulares alineados al final de la cuarta. En móvil, esas cuatro columnas colapsan a una y las tarjetas se apilan en el mismo orden de lectura.

Estructura: fondo mineral claro con tarjetas blancas de esquinas muy redondeadas; **superficies sólidas, sin cristal ni translucidez**. Riel lateral angosto, flotante y redondeado, separado de las tarjetas, con iconos de una línea y el avatar al pie. Cabecera con saludo, buscador en cápsula y botones circulares de aviso. Rejilla de una fila de cuatro KPI compactos arriba y luego filas de tres tarjetas de anchos distintos (una ancha más dos angostas). **Exactamente una** tarjeta va en verde oscuro con texto claro, como acento de la pantalla; las demás, blancas.

Piezas reutilizables: KPI de etiqueta pequeña + cifra grande + sparkline (barras o línea) o icono en círculo tenue · cápsula de comparación verde/roja con signo y porcentaje · selector de período discreto en la esquina de la tarjeta · badge de estado con punto · gauge semicircular con el porcentaje al centro · filas de lista con barra vertical, título, hora y badge · gráfica de área suave, sin rejilla pesada ni ejes marcados.

Cómo se llena en Miramenu: los KPI salen de los agregados de Medición (entradas, vistas, exposición y pasos rápidos) y de Interacciones (likes y comentarios aprobados), cada uno con su comparación contra el período anterior · la tarjeta ancha lleva la tendencia por día · el gauge, una tasa, con "—" si no hay denominador · las listas, los rankings · donde el referente pone el perfil del usuario va el del restaurante o la sucursal. Cada tarjeta identifica período y unidad, y un dato ausente no se dibuja como cero. Qué cuatro KPI van arriba queda por decidir.

Qué **no** se copia: tarjetas de crédito, transferencias, gastos y "Earnings" (el dashboard no muestra ventas: pedidos, pagos y cobro están fuera de alcance en `design.md`) · seguidores y seguidos, que son una metáfora social ajena al dueño del restaurante · los textos en inglés · los grises claros del texto secundario del referente, que no llegan a 4.5:1. Tampoco los botones de aviso de la cabecera, mientras no haya avisos que mostrar. El referente es de escritorio: en móvil las columnas colapsan a una, el riel pasa a una barra flotante inferior y la tabla de platillos se vuelve tarjetas apiladas.

### Tokens del dashboard, medidos sobre `dashboard.png`

Superficies: fondo de página `#EAE9E3` —en la práctica el token Mineral, usa el token— y tarjeta `#FFFFFF`. Cifra destacada en tinta verde oscura `#193127` sobre blanco (13.91:1). Badge positivo `#E8EDEB` con texto `#29332E` (11.04:1) y negativo `#F8EBEB` con texto `#4C1006` (13.06:1): ambos pasan de sobra y se pueden copiar tal cual.

**Acento propio del dashboard, decidido en la demo.** La especificación se contradice: dice que el dashboard comparte acento con la experiencia pública (§ Dashboard) y también que usa "tinta verde oscura" (§ Color). Se eligió el verde: la familia salvia del referente se incorpora como tokens del dashboard, oscurecida para cumplir contraste. No se usa en el menú, que conserva Tinta de acento y Champán.

| Pieza             | Referente, no cumple                                   | Valor a usar                             | Contraste                                  |
| ----------------- | ------------------------------------------------------ | ---------------------------------------- | ------------------------------------------ |
| Tarjeta de acento | Degradado `#829E8E` a `#577564`; texto blanco a 3.17:1 | Degradado diagonal `#577564` a `#3F5A4B` | Blanco de 5.08:1 a 7.57:1                  |
| Relleno del gauge | `#8AA392`; 2.33:1 contra la pista                      | `#577564` sobre pista `#E8EFEC`          | 4.35:1 con la pista, 5.08:1 con la tarjeta |

El gauge conserva el porcentaje en texto al centro: el estado no depende solo del color. Tarjeta contra fondo es 1.22:1: eso es separación ornamental, no un borde funcional, y no sirve para delimitar un control.
