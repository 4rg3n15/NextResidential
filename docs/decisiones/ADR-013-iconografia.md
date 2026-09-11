# ADR-013 · Iconografía: Lucide, bajo licencia ISC

**Fecha:** 2026-09-11 · **Estado:** aceptada · **Etapa:** 09-B

## Contexto

Hasta la 09-B cada icono se dibujaba a mano como `<svg>` en el componente que lo
necesitaba: cuatro en el tablero, cinco en los distintivos, uno en los estados,
uno en el botón. Funciona, y tiene tres problemas que se notan al mirar la
consola entera de una vez:

1. **No forman un sistema.** Cada uno se trazó por separado, así que el grosor,
   el tamaño de la caja y el redondeo de los extremos no coinciden entre sí. Es
   exactamente lo que hace que una interfaz «se vea generada»: cada pieza está
   bien y el conjunto no encaja.
2. **Cada icono nuevo es trabajo de dibujo**, y eso empuja a reutilizar el que
   ya existe aunque signifique otra cosa.
3. El mockup pide iconos en sitios donde hoy no hay ninguno —la barra lateral,
   las tarjetas de KPI, las acciones de tabla—, y dibujar treinta a mano no era
   plan.

## Decisión

**Lucide**, vía el paquete `lucide-react` 1.45.0.

- **Licencia ISC**, permisiva: uso comercial, modificación y redistribución
  permitidos, sin obligación de publicar cambios. Solo exige conservar el aviso
  de copyright, que viaja en el propio paquete. Compatible con la cláusula de
  titularidad de Grupo Control: el entregable no queda contaminado.
- Es el sucesor mantenido de Feather, y su geometría —caja de 24, trazo de 2,
  extremos redondeados— es la que el sistema de diseño ya había derivado del
  mockup en `03-mockups.md` §5.3. No hay que adaptar nada.
- Se importa **icono a icono** (`import { House } from 'lucide-react'`), no el
  paquete entero, para que el empaquetador solo incluya los que se usan.

Se descartó Heroicons por una razón práctica y no de gusto: tiene menos
cobertura en el vocabulario de este dominio —talanquera, torniquete, latido,
sincronización— y habría obligado a mezclar dos familias.

## Consecuencias

- Los `<svg>` dibujados a mano se sustituyen donde exista el equivalente. Los
  que no tengan equivalente —si aparece alguno propio del dominio— se dibujan
  con **la misma geometría de Lucide** para que no se distingan del resto.
- `lucide-react` es dependencia de `apps/web`. No entra en `packages/`: el
  dominio no pinta.
- La app Flutter de la ETAPA 11 usará `lucide_icons` o equivalente, para que las
  dos superficies compartan vocabulario visual.
- Un icono nunca es el único portador de significado (§5.6.2): siempre lleva
  texto o `aria-label`.
