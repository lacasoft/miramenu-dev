# ADR-0034: Usar contraseñas de 12 a 128 caracteres, sin reglas de composición, con hash scrypt

- Estado: Aceptado
- Fecha: 2026-11-10
- Decisores: creador de Miramenu
- Fuente: decisión tomada al planear la fase 1; el diseño no fijaba política de contraseñas

## Contexto

Los admins y el superadmin entran solo con contraseña: no hay doble factor en v1 (_Fuera de alcance_). El objetivo de seguridad es ASVS 5.0 L2. NIST SP 800-63B recomienda un mínimo de 15 caracteres cuando la contraseña es el único factor, sin reglas de composición. El login ya limita los intentos (ADR-0021).

Atributos en juego (ISO/IEC 25010): seguridad (autenticidad) y capacidad de interacción.

## Decisión

- Mínimo **12** y máximo **128** caracteres, contados como caracteres Unicode (no unidades UTF-16). Cualquier carácter vale y no hay reglas de composición.
- Antes de calcular el hash, la contraseña se normaliza a NFKC, para que dos formas equivalentes de la misma letra (ñ compuesta o descompuesta) sean la misma contraseña.
- Hash con **`scrypt` de `node:crypto`** (N=2^17, r=8, p=1, sal de 16 bytes), guardado como `scrypt$N$r$p$sal$hash`, para poder subir los parámetros sin romper los hashes viejos. Sin dependencias nuevas.
- La verificación usa `timingSafeEqual`. Un correo inexistente se verifica contra un hash señuelo, para que tarde lo mismo que uno existente.
- Sin chequeo contra contraseñas filtradas en esta fase.

## Alternativas consideradas

- Mínimo 15 (NIST para un solo factor): más fuerte; se eligió 12 por comodidad de los admins.
- `bcrypt` o `argon2`: buenas opciones, pero agregan una dependencia nativa; `scrypt` viene con Node.

## Consecuencias

- Positivas: sin dependencias nuevas, y la política no castiga frases largas.
- Negativas y riesgos aceptados: **12 caracteres queda por debajo de la recomendación de NIST para un solo factor.** Lo compensan en parte el límite de intentos (ADR-0021) y el hash costoso. Cada hash usa 128 MiB y ~200 ms del pool de hilos de Node.
- Revisar al agregar doble factor o un chequeo de contraseñas filtradas, o si cambia el perfil de riesgo del superadmin.
