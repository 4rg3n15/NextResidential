/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UN ÁRBOL DONDE REINTRODUCIR UN DEFECTO SIN TOCAR EL REPOSITORIO · 15-K
 *
 * Las pruebas negativas de los recorridos (arranque con tsx, recorrido de la
 * consola) necesitan EJECUTAR la API o la consola con un defecto dentro. La
 * sonda de siempre clona sin `node_modules` y no puede ejecutar nada; copiar
 * el árbol entero con sus dependencias cuesta cientos de megas.
 *
 * Aquí se copia SÓLO la aplicación que se va a mutar (sin `node_modules`,
 * `dist` ni `.next`) y todo lo demás se enlaza al repositorio real: las
 * dependencias, los paquetes internos, las migraciones. pnpm ya resuelve por
 * enlaces simbólicos, así que el árbol se comporta como el original salvo en
 * el fichero que se cambió.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const raizDelRepositorio = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const NO_SE_COPIA = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage']);

/**
 * @param {{ copiar: readonly string[] }} opciones  aplicaciones a copiar, p. ej. `['apps/api']`
 * @returns {{ raiz: string, mutar: (fichero: string, antes: string | RegExp, despues: string) => void, limpiar: () => void }}
 */
export const arbolDeSonda = ({ copiar }) => {
  const raiz = mkdtempSync(join(tmpdir(), 'ncr-sonda-'));
  for (const entrada of readdirSync(raizDelRepositorio)) {
    if (entrada === '.git' || entrada === 'apps') continue;
    symlinkSync(join(raizDelRepositorio, entrada), join(raiz, entrada));
  }
  mkdirSync(join(raiz, 'apps'));
  for (const app of readdirSync(join(raizDelRepositorio, 'apps'))) {
    const relativa = `apps/${app}`;
    const origen = join(raizDelRepositorio, relativa);
    if (!copiar.includes(relativa)) {
      symlinkSync(origen, join(raiz, relativa));
      continue;
    }
    cpSync(origen, join(raiz, relativa), {
      recursive: true,
      filter: (ruta) => !NO_SE_COPIA.has(ruta.split('/').pop() ?? ''),
    });
    if (existsSync(join(origen, 'node_modules'))) {
      symlinkSync(join(origen, 'node_modules'), join(raiz, relativa, 'node_modules'));
    }
  }
  return {
    raiz,
    /**
     * Cambia UNA cosa y exige que haya cambiado: un parche que no aplica
     * dejaría la sonda probando el árbol sano, y la prueba negativa «fallaría
     * bien» por un motivo que no es el suyo.
     */
    mutar: (fichero, antes, despues) => {
      const ruta = join(raiz, fichero);
      const texto = readFileSync(ruta, 'utf8');
      const cambiado = texto.replace(antes, despues);
      if (cambiado === texto) {
        throw new Error(`el parche no aplica en ${fichero}: no se encontró ${String(antes)}`);
      }
      writeFileSync(ruta, cambiado);
    },
    limpiar: () => rmSync(raiz, { recursive: true, force: true }),
  };
};
