# ADR-014 · El tema se declara como parejas de fondo y texto, no como lista de colores

- **Estado**: aceptada
- **Fecha**: 2026-09-11
- **Etapa**: 09-B, bloque 6
- **Sustituye a**: nada. Extiende el sistema de diseño de la ETAPA 00 (§5 de
  `docs/auditoria/03-mockups.md`)

## Contexto

La consola tenía un solo tema y una suite de contraste que medía **colores
contra superficies**, elegidos a mano. Esa suite ya había servido para algo
real: destapó que el rojo de marca `#E63946` no llega a AA para texto normal y
obligó a introducir `marca.texto` y `marca.boton`.

Al añadir el modo oscuro, ese diseño se queda corto por un motivo concreto. El
modo oscuro no se rompe por un color mal elegido: se rompe porque se invierten
los **fondos** y se deja el texto a su suerte. El resultado —un botón claro con
etiqueta blanca encima, un borde que desaparece, un distintivo ilegible— no lo
detecta ninguna prueba, porque en ninguna parte consta que ese fondo y ese texto
vayan juntos.

## Decisión

**Un tema es una lista de parejas, no una lista de colores.**

1. `packages/config/src/temas.ts` declara `TEMA_CLARO` y `TEMA_OSCURO` con la
   misma forma —garantizada por el compilador— y, junto a ellos, `PAREJAS`: cada
   combinación de primer plano y fondo que existe en pantalla, con el umbral que
   le corresponde.
2. `temas.test.ts` mide **cada pareja en los dos temas**. Una combinación nueva
   no se puede pintar sin nombrarla: para usarla hay que declararla, y al
   declararla se mide.
3. El preset emite `rgb(var(--ncr-…) / <alpha-value>)` y declara las variables en
   la capa base, una vez por tema. **Ninguna de las dieciocho vistas cambia de
   clase.**
4. `scripts/lib/frontera-tema.mjs` rompe la construcción ante cualquier color
   fuera del sistema: literal, de la paleta por defecto de Tailwind, hexadecimal
   en la clase, o un `dark:` suelto.

## Alternativas descartadas

**`dark:` de Tailwind, variante por variante.** Es lo habitual y es lo que
falla: reparte la decisión entre cientos de sitios y basta olvidarlo en uno para
que quede un panel blanco en mitad de la pantalla oscura. Además no deja nada
que medir — un `dark:bg-slate-900` no es una pareja, es media.

**Dos presets, uno por tema.** Duplica la paleta y garantiza que se separen.

**Invertir programáticamente la luminancia del tema claro.** Produce grises
sucios y no respeta que hay colores que **no deben** invertirse: los rellenos
saturados con etiqueta blanca y la barra lateral, que es oscura en ambos temas
porque es identidad y no consecuencia del tema.

## Consecuencias

- Al declarar las parejas apareció un fallo del tema **claro** que llevaba nueve
  pantallas en verde: `bg-exito text-white` daba 2,537 : 1. Se corrigió con
  `exito.boton`.
- Apareció un token que faltaba: `campo`. Catorce formularios llevaban `bg-white`
  literal junto a `text-texto`.
- La ETAPA 11 traducirá **dos** temas a `ThemeData`, no uno. `TEMA_CLARO` y
  `TEMA_OSCURO` se exportan con esa forma precisamente para eso.
- Añadir una pantalla con una combinación nueva cuesta una línea en `PAREJAS`.
  Si alguien no la añade, `frontera-tema.mjs` no lo detecta —el color sigue
  siendo un token válido—: lo que se pierde es la medida, no la coherencia. Es
  el hueco conocido de esta decisión y se declara aquí en vez de fingir que no
  existe.
