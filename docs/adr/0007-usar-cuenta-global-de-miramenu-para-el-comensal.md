# ADR-0007: Usar una cuenta global de Miramenu para el comensal

- Estado: Aceptado
- Fecha: 2026-11-09
- Decisores: creador de Miramenu, en el diseño
- Fuente: `design.md` (`../miramenu/design.md` desde la raíz del repo), DEC-07

## Contexto

El comensal empieza anónimo y puede registrarse con celular y nombre, y correo opcional, validados con un código enviado por WhatsApp o SMS, para recibir ofertas más adelante (diseño, _Requisitos → Identidad del comensal_). Comentar exige registro.

Atributos en juego (ISO/IEC 25010): seguridad (confidencialidad de datos personales) y capacidad de interacción (un solo registro).

## Decisión

- La cuenta del comensal es de Miramenu y sirve en todos los negocios. Miramenu es el dueño de los datos del comensal; los negocios solo los usan.
- El negocio solo ve el nombre del comensal, nunca su celular ni su correo.
- Cuando existan las ofertas, el comensal las acepta una sola vez para todos los negocios (Consentimiento, con la versión del aviso de privacidad).
- Al registrarse, los likes que dio como anónimo en ese celular pasan a su cuenta; si ya tenía like en el mismo platillo desde otro celular, queda uno solo. Lo hace Interacciones al escuchar `ComensalRegistrado`; Comensales no toca los likes.

## Alternativas consideradas

- Una cuenta por negocio: el comensal se registra de nuevo en cada restaurante y su celular queda en manos de cada negocio.

## Consecuencias

- Positivas: un registro sirve en todos los negocios y los celulares nunca salen de Miramenu.
- Negativas y riesgos aceptados: Miramenu responde legalmente por los datos de todos los comensales; la retención (RNF-07) está por revisar contra la ley mexicana de datos personales.
- Fallas asociadas (_Flujo: registro con código_): el aviso `ComensalRegistrado` se guarda en la misma transacción que el registro; si se pierde, Interacciones procesa los avisos pendientes, y si llega dos veces, Interacciones anota qué dispositivos ya pasó.
