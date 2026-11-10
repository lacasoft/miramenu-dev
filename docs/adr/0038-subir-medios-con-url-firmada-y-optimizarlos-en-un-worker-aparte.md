# ADR-0038: Subir medios con URL firmada y optimizarlos en un worker aparte

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisiones tomadas al planear la fase 2b (Catálogo: medios); concreta ADR-0006 y ADR-0015

## Contexto

ADR-0006 dice que subir un medio guarda el original, responde al recibirlo y encola su optimización en un worker con `ffmpeg`, y que los medios se sirven directo del almacenamiento. ADR-0015 dice que un medio listo genera una versión nueva del menú, copiada de la vigente. Faltaba decidir:

- por dónde pasan los bytes;
- dónde vive el original, que trae su EXIF (por ejemplo, el GPS de una foto de celular);
- qué variantes se generan;
- cómo se contiene a `ffmpeg` frente a archivos hostiles;
- cómo se entera el admin de un medio que falló o se atoró.

Atributos en juego (ISO/IEC 25010): eficiencia de desempeño (la API no carga con los bytes), seguridad (confidencialidad del original y contención de entradas no confiables) y fiabilidad.

## Decisión

- **Subida firmada:**
  - El API crea el Medio (`pending_upload`) y firma un `PUT` de vida corta (`MEDIA_UPLOAD_URL_TTL_SECONDS`, 10 min) directo al almacenamiento, con el tipo y el tamaño declarados dentro de la firma.
  - Al terminar, el admin confirma la subida. El API revisa con `HEAD` que llegó exactamente lo firmado: si no, el Medio queda `failed` (`upload_mismatch`), se borra el original y se responde 422.
  - Si llegó bien, el Medio pasa a `processing` y se encola. Confirmar de nuevo vuelve a encolar, y así se recupera una confirmación cuyo encolado falló.
- **Límites:** imagen de hasta 15 MB (JPEG, PNG o WebP); video de hasta 200 MB y 60 s (MP4, MOV o WebM); 8192 px por lado como máximo. Se revisan al firmar, al confirmar y con `ffprobe` en el worker, sin confiar en el tipo declarado.
- **Dos buckets:** `S3_BUCKET` guarda las variantes y se lee sin credenciales. `S3_ORIGINALS_BUCKET` guarda los originales y solo lo leen el API y el worker. Las variantes se recodifican sin metadatos.
- **Variantes:**
  - Imagen → WebP de 480, 960 y 1440 px de ancho, sin ampliar nunca.
  - Video → MP4 H.264 con el lado corto en 720 px como máximo, `+faststart` y AAC si tiene audio, más un póster WebP de 480 y 960 px.
  - Las dimensiones se leen del archivo que escribió `ffmpeg`, no se calculan.
  - Las claves son únicas por medio y se suben con `Cache-Control: immutable`.
- **Contención de `ffmpeg`:** `execFile` sin shell, `-nostdin`, solo archivos locales (`-protocol_whitelist file`), tiempo máximo con `SIGKILL`, formatos y códecs en lista blanca validados con `ffprobe` antes de transcodificar, y un directorio temporal por trabajo que siempre se borra.
- **Worker:** proceso aparte con el mismo código (`npm run start:worker -w api`), con BullMQ sobre el cliente de Redis de la cola.
  - El id del trabajo es el del medio.
  - Hay 3 intentos con espera exponencial; al agotarlos, el Medio queda `failed` y el trabajo se conserva en la lista de fallidos.
  - Un archivo inaceptable falla sin reintentar.
- **Medios en el menú y ADR-0015:**
  - Los platillos llevan `imageId` y `videoId`, y el perfil, `logoId`.
  - Al combinar, solo se resuelven los medios listos; los que siguen pendientes se guardan en `pending_media` de esa versión.
  - Cuando el worker marca un Medio como listo, en la misma transacción y con los mismos bloqueos que una publicación, genera una versión `media_ready` para cada sucursal que lo espera. Esa versión se combina de nuevo con las mismas instantáneas publicadas, nunca con el borrador.
  - `UNIQUE (branch_id, media_id)` impide dos versiones por el mismo Medio.
  - Si el video falla, el platillo conserva su foto y no se genera ninguna versión.
- **Alcance:** el negocio sube sus medios por su ruta (`administer`) y cada sucursal por la suya (`operate`). El menú base y el perfil del negocio usan solo medios del negocio; los platillos propios y el perfil de una sucursal usan los del negocio o los suyos, nunca los de una hermana.
- **Avisos:** sin correo. Cada medio muestra su estado y `stalled` cuando lleva más de `MEDIA_STALLED_MINUTES` (10) procesándose; `GET …/media?problem=true` lista los fallidos y los atorados.

## Alternativas consideradas

- Subir a través del API: un solo camino, pero la API cargaría con hasta 200 MB por video, y la memoria y el ancho de banda escalarían con las subidas.
- Un solo bucket público: más simple, pero los originales con EXIF quedarían a una URL de distancia.
- Avisar por correo: más visible, pero suma plantillas y envíos para algo que el admin ve al entrar.

## Consecuencias

- Positivas: la API no toca los bytes; ningún original queda público; el menú es reproducible por versión y gana el video sin que nadie vuelva a publicar.
- Negativas y riesgos aceptados:
  - En producción hace falta configurar CORS del almacenamiento para el origen del admin.
  - Un Medio que nunca se confirma deja su fila y, si se subió, su original. Hará falta una regla de ciclo de vida en el bucket de originales.
  - En producción, el worker debería correr en un contenedor sin red, aunque ya solo lee archivos locales.
  - Cada medio que queda listo genera una versión más del menú de cada sucursal que lo espera.
  - La orientación EXIF de las fotos JPEG depende de la versión de `ffmpeg` (ffmpeg 8 la aplica); hay que confirmarlo con la del servidor de producción.
