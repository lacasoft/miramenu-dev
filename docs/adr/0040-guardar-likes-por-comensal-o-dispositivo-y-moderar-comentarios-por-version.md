# ADR-0040: Guardar likes por comensal o dispositivo y moderar comentarios por versión

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisiones tomadas al planear la fase 4 (Interacciones); concreta ADR-0007, ADR-0008 y el paso 6 del flujo "registro con código"

## Contexto

El diseño pide likes por platillo y sucursal, únicos por `(sucursal, platillo, comensal o dispositivo)`, que se fijan con `PUT` y que, al registrarse el comensal, pasan a su cuenta sin duplicarse. También pide comentarios solo de comensales registrados, moderados antes de verse, que vuelven a espera si se editan, y un aviso cuando llevan más de 24 h en espera. Moderan el admin del negocio, el admin de esa sucursal y el superadmin.

Faltaba decidir:

- la clave de un like según la identidad;
- cómo evitar que un moderador apruebe un texto que no leyó;
- cómo se avisa de los comentarios atrasados;
- qué límites protegen la fila de moderación;
- cómo y dónde se consumen los avisos `DinerRegistered`.

Atributos en juego (ISO/IEC 25010): adecuación funcional (conteos correctos), seguridad (aislamiento entre negocios y moderación previa) y fiabilidad (un aviso perdido, duplicado o aplicado a medias).

## Decisión

- **Like:**
  - Un comensal registrado da like como su cuenta, desde cualquier dispositivo; uno anónimo, como su dispositivo.
  - Dos índices únicos parciales lo garantizan: `(branch_id, dish_id, diner_id)` y `(branch_id, dish_id, device_id) WHERE diner_id IS NULL`.
  - `PUT … /like { active }` fija el estado, y `false` borra la fila.
  - Solo se acepta un platillo del menú publicado de esa sucursal, por el contrato nuevo de Catálogo `MenuDishes`. Un platillo oculto no está en ese menú.
- **Sin límite de likes:** se acepta el riesgo de que alguien infle los likes cambiando el id de su dispositivo. En un restaurante todos comparten la IP de la wifi, y un tope por IP frenaría a los comensales reales. Medición acepta el mismo riesgo con sus eventos.
- **Comentario:**
  - Hasta 280 caracteres.
  - Nace en espera. Editarlo lo devuelve a espera y sube su `version`, aunque ya estuviera aprobado, y queda oculto hasta que se apruebe de nuevo.
  - Borrarlo lo marca como borrado y deja de verse.
  - `client_id` es único por comensal: un reintento devuelve el mismo comentario (200), y el mismo `client_id` con otro texto responde 409 `CLIENT_ID_REUSED`.
  - El comentario de otro comensal responde 404.
- **Moderar por versión:**
  - Aprobar o rechazar lleva la `version` que leyó el moderador.
  - Si cambió (el autor editó) o el comentario ya no está en espera (otro moderador decidió), responde 409 `COMMENT_CHANGED`. El `UPDATE` repite la condición, así que una carrera entre el chequeo y la escritura también da 409.
- **Quién modera:**
  - `AccessControl` a nivel `operate`, en un solo punto y antes de leer o cambiar el comentario: 404 fuera del alcance, 403 dentro si el rol no alcanza.
  - El admin de una sucursal ve la fila de la suya, no la del negocio entero.
  - La fila del negocio usa `BranchDirectory.branchIdsOf`, sin copiar `business_id` en Interacciones.
- **Aviso de 24 h:** sin correo. Cada pendiente lleva `overdue`, la fila da `overdueCount` y `?overdue=true` lista solo los atrasados. El umbral es `COMMENT_OVERDUE_HOURS`.
- **Límite de comentarios:**
  - 5 por hora por comensal (`COMMENTS_PER_DINER_PER_HOUR`), contando publicaciones y ediciones.
  - Si Redis cae, se sigue comentando sin el límite. El diseño solo cierra los códigos y el login sin Redis, y cada comentario lo modera una persona de todos modos.
- **Paso de los likes a la cuenta:**
  - El worker lee los avisos `DinerRegistered` de Comensales (`DinerRegistrations.after`) cada `LIKE_TRANSFER_INTERVAL_SECONDS`.
  - Aplica cada aviso en su propia transacción:
    - borra los likes anónimos del dispositivo que la cuenta ya tenía;
    - pasa los demás a la cuenta;
    - anota el dispositivo en `transferred_device` (clave: la posición del aviso);
    - avanza el cursor.
  - Así un aviso se aplica una vez aunque el worker caiga a mitad de una ronda, y el orden de las posiciones (ADR-0039) evita saltarse uno.
  - El cursor se toma con `FOR UPDATE NOWAIT`: con varios workers, uno aplica y los demás esperan su siguiente ronda.
- **Conteos:**
  - `GET /branches/:branchId/interactions` da likes y comentarios aprobados por platillo, con `Cache-Control: public, max-age=10`, dentro de los 30 s de RNF-04.
  - El mismo cálculo se expone como contrato (`InteractionCounts`) para el dashboard de Medición.
  - Los comentarios de un platillo también se sirven con 10 s de caché pública.

## Alternativas consideradas

- **Like como interruptor (`POST` que alterna):** un reintento lo deshace. El diseño pide fijar el estado.
- **Moderar sin versión:** más simple, pero una edición entre la lectura y la aprobación publicaría un texto que nadie revisó.
- **Avisar por correo:** más visible, pero necesitaría un contrato con los correos de los admins, plantillas y una tarea programada, para algo que el admin ve al entrar.
- **Límite de likes por IP:** frenaría a toda la wifi de un restaurante con pocos likes.
- **Cerrar los comentarios si cae Redis:** sería consistente con los códigos, pero tiraría una función que la moderación ya protege.
- **Una cola para los avisos:** la tabla con posición de Comensales ya es un outbox ordenado. Leerla con un cursor en la misma transacción no pierde ni repite nada, sin más piezas.

## Consecuencias

- **Positivas:**
  - Ningún comentario se publica sin que alguien lea esa versión.
  - El paso de los likes es idempotente y sobrevive a caídas.
  - Los conteos no incluyen nada sin moderar.
  - Interacciones no copia datos de otros contextos: los consulta por sus contratos.
- **Negativas y riesgos aceptados:**
  - Los likes anónimos se pueden inflar cambiando el id del dispositivo.
  - Si un dispositivo ya ligado da likes después de cerrar la sesión, esos likes quedan anónimos: Comensales no emite otro aviso para un dispositivo que ya pasó a la cuenta (ADR-0039).
  - Sin el worker, los likes no pasan a la cuenta; se pasan todos cuando vuelve.
  - Con Redis caído no hay límite de comentarios.
  - Entre que el comensal se registra y el worker aplica el aviso (hasta 5 s), un like dado desde la cuenta y el anónimo del mismo platillo cuentan doble.
