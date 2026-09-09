#!/usr/bin/env node
/**
 * CONTROL · el contrato y el cliente generado están al día respecto del código.
 *
 * POR QUÉ EXISTE. «Un cliente que se regenera a mano se desincroniza y nadie lo
 * nota» — y no se nota porque el síntoma no es un error, es un tipo que sigue
 * describiendo la API de la semana pasada. La consola compila, las pruebas
 * pasan, y el campo que el backend renombró llega como `undefined` en
 * producción.
 *
 * QUÉ HACE. Regenera `packages/contracts/openapi.json` y
 * `packages/contracts/src/generado/api.ts` **en un directorio temporal fuera
 * del árbol** y los compara byte a byte con los versionados. Si difieren, falla
 * y dice qué comando ejecutar. No toca el repositorio: es la misma disciplina
 * que `scripts/lib/pruebas-negativas.mjs` adoptó tras alterar ficheros
 * versionados.
 *
 * Reproducible por construcción: el comando que verifica es el mismo que
 * genera, así que no puede haber dos formas de producir el cliente.
 *
 *   node scripts/lib/contrato-desfasado.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const raiz = process.cwd();
const CONTRATO = 'packages/contracts/openapi.json';
const CLIENTE = 'packages/contracts/src/generado/api.ts';

const correr = (cmd, args, opciones = {}) => {
  try {
    execFileSync(cmd, args, {
      cwd: raiz,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 300_000,
      ...opciones,
    });
    return { ok: true, salida: '' };
  } catch (e) {
    return { ok: false, salida: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
};

const banco = mkdtempSync(join(tmpdir(), 'ncr-contrato-'));
try {
  // 1 · El contrato se regenera desde la API compilada, al temporal.
  const contratoNuevo = join(banco, 'openapi.json');
  const generacion = correr('node', ['apps/api/dist/openapi.js'], {
    env: { ...process.env, NCR_DESTINO_OPENAPI: contratoNuevo },
  });
  if (!generacion.ok) {
    console.log('FALLO no se pudo generar el contrato. ¿Está compilada la API (`pnpm build`)?');
    console.log(generacion.salida.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }

  const versionado = readFileSync(resolve(raiz, CONTRATO), 'utf8');
  if (readFileSync(contratoNuevo, 'utf8') !== versionado) {
    console.log(
      `FALLO ${CONTRATO} está desfasado respecto de los controladores.\n` +
        '      Ejecuta `pnpm contrato && pnpm contrato:cliente` y confirma el cambio.',
    );
    process.exit(1);
  }

  // 2 · El cliente se regenera desde el contrato versionado, también al
  //     temporal. Se compara contra el que está en el árbol.
  const clienteNuevo = join(banco, 'api.ts');
  cpSync(resolve(raiz, CONTRATO), join(banco, 'contrato-versionado.json'));
  // Se resuelve el ENTRY del paquete, no el enlace de `.bin`. Dos motivos: con
  // pnpm los `.bin` cuelgan del paquete que declara la dependencia y no de la
  // raíz, y ese enlace es un envoltorio de shell que `node <ruta>` no sabe
  // interpretar. `createRequire` desde el paquete que la declara da la ruta
  // real del JavaScript, y funciona igual en macOS y en Linux.
  const requerir = createRequire(resolve(raiz, 'packages/contracts/package.json'));
  const cli = requerir.resolve('openapi-typescript/bin/cli.js');
  const cliente = correr('node', [
    cli,
    join(banco, 'contrato-versionado.json'),
    '-o',
    clienteNuevo,
  ]);
  if (!cliente.ok) {
    console.log('FALLO el generador del cliente abortó sobre el contrato versionado:');
    console.log(cliente.salida.split('\n').slice(0, 8).join('\n'));
    process.exit(1);
  }

  if (readFileSync(clienteNuevo, 'utf8') !== readFileSync(resolve(raiz, CLIENTE), 'utf8')) {
    console.log(
      `FALLO ${CLIENTE} no coincide con el contrato.\n` +
        '      Ejecuta `pnpm contrato:cliente` y confirma el cambio.',
    );
    process.exit(1);
  }

  console.log('OK contrato y cliente generado al día respecto de los controladores');
} finally {
  rmSync(banco, { recursive: true, force: true });
}
