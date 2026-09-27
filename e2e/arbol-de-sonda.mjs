/**
 * ═════════════════════════════════════════════════════════════════════════════
 * UN ÁRBOL DONDE REINTRODUCIR UN DEFECTO SIN TOCAR EL REPOSITORIO · 15-K
 *
 * Las pruebas negativas de los recorridos (arranque con tsx, recorrido de la
 * consola) necesitan EJECUTAR la API o la consola con un defecto dentro. La
 * sonda de siempre clona sin `node_modules` y no puede ejecutar nada; copiar
 * el árbol entero con sus dependencias cuesta cientos de megas.
 *
 * Aquí se copia SÓLO lo que se va a mutar (sin `node_modules`, `dist` ni
 * `.next`) y todo lo demás se enlaza al repositorio real: las dependencias,
 * los paquetes internos, las migraciones. pnpm ya resuelve por enlaces
 * simbólicos, así que el árbol se comporta como el original salvo en el
 * fichero que se cambió.
 *
 * Anexo 15-K · también se puede copiar un PAQUETE interno (`packages/providers`,
 * donde viven H-SITIO-13 y 15). Entonces no basta con copiarlo: los enlaces
 * de pnpm de cada aplicación copiada son RELATIVOS a su sitio real y seguirían
 * llevando al paquete sano. Por eso su `node_modules` se rehace aquí como un
 * directorio de enlaces, con `@ncr/<paquete>` apuntando a la copia, y la copia
 * se compila (`compilar`): las aplicaciones lo cargan por su `dist`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { spawnSync } from 'node:child_process';
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
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const raizDelRepositorio = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const NO_SE_COPIA = new Set(['node_modules', 'dist', '.next', '.turbo', 'coverage']);

/** Copia `relativa` sin artefactos ni dependencias; éstas se enlazan al original. */
const copiarSinArtefactos = (raiz, relativa) => {
  const origen = join(raizDelRepositorio, relativa);
  cpSync(origen, join(raiz, relativa), {
    recursive: true,
    filter: (ruta) => !NO_SE_COPIA.has(ruta.split('/').pop() ?? ''),
  });
};

/**
 * El `node_modules` de una aplicación copiada, rehecho como directorio de
 * enlaces ABSOLUTOS al original salvo los paquetes internos copiados, que
 * apuntan a su copia del árbol.
 */
const dependenciasCon = (raiz, app, paquetesCopiados) => {
  const original = join(raizDelRepositorio, app, 'node_modules');
  const destino = join(raiz, app, 'node_modules');
  if (paquetesCopiados.length === 0) {
    if (existsSync(original)) symlinkSync(original, destino);
    return;
  }
  mkdirSync(join(destino, '@ncr'), { recursive: true });
  for (const entrada of readdirSync(original)) {
    if (entrada !== '@ncr') symlinkSync(join(original, entrada), join(destino, entrada));
  }
  for (const interno of readdirSync(join(original, '@ncr'))) {
    const copia = paquetesCopiados.find((p) => p === `packages/${interno}`);
    symlinkSync(
      copia === undefined ? join(original, '@ncr', interno) : join(raiz, copia),
      join(destino, '@ncr', interno),
    );
  }
};

/**
 * @param {{ copiar: readonly string[] }} opciones  lo que se va a mutar, p. ej. `['apps/api']`
 *   o `['apps/api', 'packages/providers']`
 * @returns {{ raiz: string, mutar: (fichero: string, antes: string | RegExp, despues: string) => void, compilar: (paquete: string) => void, limpiar: () => void }}
 */
export const arbolDeSonda = ({ copiar }) => {
  const raiz = mkdtempSync(join(tmpdir(), 'ncr-sonda-'));
  const paquetesCopiados = copiar.filter((c) => c.startsWith('packages/'));
  for (const entrada of readdirSync(raizDelRepositorio)) {
    if (entrada === '.git' || entrada === 'apps' || entrada === 'packages') continue;
    symlinkSync(join(raizDelRepositorio, entrada), join(raiz, entrada));
  }
  for (const grupo of ['apps', 'packages']) {
    mkdirSync(join(raiz, grupo));
    for (const nombre of readdirSync(join(raizDelRepositorio, grupo))) {
      const relativa = `${grupo}/${nombre}`;
      if (!copiar.includes(relativa)) {
        symlinkSync(join(raizDelRepositorio, relativa), join(raiz, relativa));
        continue;
      }
      copiarSinArtefactos(raiz, relativa);
      if (grupo === 'apps') {
        dependenciasCon(raiz, relativa, paquetesCopiados);
      } else if (existsSync(join(raizDelRepositorio, relativa, 'node_modules'))) {
        symlinkSync(
          join(raizDelRepositorio, relativa, 'node_modules'),
          join(raiz, relativa, 'node_modules'),
        );
      }
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
    /** Compila la COPIA de un paquete interno: sin esto la aplicación cargaría un `dist` que no existe. */
    compilar: (paquete) => {
      const tsc = createRequire(join(raizDelRepositorio, 'package.json')).resolve(
        'typescript/bin/tsc',
      );
      const r = spawnSync(process.execPath, [tsc, '-b', 'tsconfig.json'], {
        cwd: join(raiz, paquete),
        encoding: 'utf8',
      });
      if (r.status !== 0) {
        throw new Error(`la copia de ${paquete} no compila: ${`${r.stdout}${r.stderr}`.trim()}`);
      }
    },
    limpiar: () => rmSync(raiz, { recursive: true, force: true }),
  };
};
