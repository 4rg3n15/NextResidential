/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SONDA 6 bis · D-149 · UN NODE ANTERIOR AL BOLETÍN DEL 21/10/2026 NO PASA
 *
 * El cambio de seguridad de D-149 es el SUELO de `engines.node` (>=22.23.4),
 * no `.nvmrc`: con el suelo viejo (>=22.11.0) un Node 22.22.2 —el que el
 * proyecto fijaba, con CVE-2026-111497 dentro— pasaba la comprobación del
 * entorno, porque distinto de `.nvmrc` es sólo un aviso.
 *
 * La sonda ejecuta el `verificar-entorno.mjs` REAL, en el clon y con el
 * `package.json` y el `.nvmrc` de la rama. El proceso informa de otra versión
 * de Node mediante un `--import` que redefine `process.versions.node`, así que
 * el control no necesita ninguna puerta para que se la inyecten. Tres casos:
 *
 *   · 22.22.2 con el `engines` de la rama → FALLA, nombrando versión y rango;
 *   · 22.23.4 con el mismo `engines`      → pasa (la mitad positiva);
 *   · 22.22.2 con el `engines` anterior   → pasaba: el suelo es el cambio.
 *
 * Vive en `sondas/` por lo mismo que las demás: `pruebas-negativas.mjs` no
 * puede crecer.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VULNERABLE = '22.22.2';
const PARCHEADA = '22.23.4';
const SUELO_ANTERIOR = '>=22.11.0 <23';

const comoNode = (correr, clon, version) =>
  correr(
    'node',
    [
      '--import',
      `data:text/javascript,Object.defineProperty(process.versions,"node",{value:"${version}"})`,
      'scripts/lib/verificar-entorno.mjs',
    ],
    { cwd: clon },
  );

export const sondaDeNodeDelBoletin = ({ raiz, clon, correr, ok, mal }) => {
  const real = readFileSync(join(raiz, 'package.json'), 'utf8');
  writeFileSync(join(clon, 'package.json'), real);
  const { engines } = JSON.parse(real);

  const vieja = comoNode(correr, clon, VULNERABLE);
  vieja.codigo !== 0 &&
  vieja.salida.includes(`Node ${VULNERABLE} queda fuera de engines.node "${engines.node}"`)
    ? ok(`Node ${VULNERABLE} (anterior al boletín) hace fallar la comprobación del entorno`)
    : mal(
        `Node ${VULNERABLE} PASA con engines "${engines.node}" (codigo ${String(vieja.codigo)}): ${vieja.salida.trim().slice(0, 160)}`,
      );

  const nueva = comoNode(correr, clon, PARCHEADA);
  nueva.codigo === 0
    ? ok(`Node ${PARCHEADA} pasa con el mismo engines`)
    : mal(`el control rechaza Node ${PARCHEADA}: ${nueva.salida.trim().slice(0, 160)}`);

  // Con el suelo anterior, el mismo Node pasaba: la sonda mide el cambio, no un rechazo cualquiera.
  const paquete = JSON.parse(real);
  paquete.engines.node = SUELO_ANTERIOR;
  writeFileSync(join(clon, 'package.json'), `${JSON.stringify(paquete, null, 2)}\n`);
  comoNode(correr, clon, VULNERABLE).codigo === 0
    ? ok(
        `con el suelo anterior (${SUELO_ANTERIOR}), Node ${VULNERABLE} pasaba: el suelo es el cambio`,
      )
    : mal(
        `con el suelo anterior Node ${VULNERABLE} ya fallaba: la sonda no mide el cambio de D-149`,
      );
  writeFileSync(join(clon, 'package.json'), real);
};
