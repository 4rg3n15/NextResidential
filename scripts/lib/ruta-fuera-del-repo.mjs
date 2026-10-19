/**
 * ═════════════════════════════════════════════════════════════════════════════
 * D-68 · UNA RUTA DE SALIDA NO SE ESCRIBE DENTRO DEL REPOSITORIO
 *
 * Los informes y respaldos de sitio llevan datos del conjunto —nombres de
 * equipos, direcciones, resultados— y por eso nunca van dentro del árbol
 * versionado. `sitio-ensayo.mjs` y `sitio-audio.mjs` tenían cada uno su propia
 * copia de esta comprobación, con redacciones distintas y ninguna prueba.
 *
 * Reportado desde el despliegue en Windows: en Git Bash,
 *
 *   pnpm sitio:ensayo -- --informe=C:\ncr-sitio\ensayo.md
 *
 * llega al guion como `C:ncr-sitioensayo.md`. El shell trata la barra
 * invertida como carácter de escape y se la come, así que la ruta ABSOLUTA se
 * convierte en RELATIVA, resuelve dentro del repositorio y el control la
 * rechaza — correctamente, pero diciendo «indique una ruta fuera» sobre una
 * ruta que el usuario había escrito fuera. El mensaje culpaba al usuario de un
 * error del shell.
 *
 * De ahí las dos cosas que esta versión añade: el mensaje dice **a dónde
 * resolvió** la ruta (ver `C:ncr-sitioensayo.md` lo explica todo de un
 * golpe), y reconoce la huella de las barras comidas para nombrar la causa
 * real y su remedio.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { resolve, sep } from 'node:path';

/**
 * ¿El shell se comió las barras invertidas de una ruta de Windows?
 *
 * La huella es inconfundible: letra de unidad, dos puntos, y acto seguido algo
 * que NO es un separador. `C:\ncr\x` → `C:ncrx`. Una ruta legítima siempre
 * trae separador tras los dos puntos (`C:\…` o `C:/…`), y `C:` a secas —el
 * directorio actual de esa unidad— no lleva nada detrás.
 *
 * Es una función de cadena, sin plataforma: la comprobación vale igual donde
 * se ejecute, y así se prueba en macOS y en Linux el caso que sólo ocurre en
 * Windows.
 */
export const barrasComidas = (ruta) => /^[A-Za-z]:(?![\\/])\S/.test(ruta ?? '');

/** El ejemplo de ruta que se le ofrece a quien está delante de ESTE sistema. */
export const ejemploDeRutaDeSalida = (plataforma = process.platform) =>
  plataforma === 'win32' ? 'C:/ncr-sitio' : '$HOME/ncr-sitio';

/** El mensaje cuando la ruta cae dentro del repositorio: dice dónde resolvió y por qué. */
export const mensajeDeRutaDentroDelRepo = (
  pedida,
  resuelta,
  que,
  plataforma = process.platform,
) => {
  const ejemplo = ejemploDeRutaDeSalida(plataforma);
  const base =
    `${que} NO se escribe dentro del repositorio: «${pedida}» resuelve a ${resuelta}. ` +
    `Indique una ruta fuera, p. ej. ${ejemplo}`;
  if (!barrasComidas(pedida)) return base;
  return (
    `${base}.\n  La ruta llegó SIN sus barras invertidas, así que dejó de ser absoluta: el ` +
    'shell las tomó como carácter de escape. Escríbala con barras normales ' +
    `(--informe=${ejemplo}/informe.md) o entre comillas simples`
  );
};

/**
 * La ruta resuelta, o `salir` con el motivo si cae dentro del repositorio.
 * `raiz` y `salir` se inyectan: el control es el mismo en los dos guiones.
 */
export const rutaFueraDelRepo = (pedida, que, raiz, salir, plataforma = process.platform) => {
  const resuelta = resolve(pedida);
  if (resuelta === raiz || resuelta.startsWith(raiz + sep)) {
    salir(mensajeDeRutaDentroDelRepo(pedida, resuelta, que, plataforma));
  }
  return resuelta;
};
