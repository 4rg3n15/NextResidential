/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SONDA 22 ter · 15-S5 · DT-15S2-11 · UN LECTOR LENTO POR CLASE DE GUION
 *
 * La auditoría de los `process.exit(` de `scripts/` (informe de la 15-S5) dejó
 * dos clases de guion EN RIESGO —salida sin tope, leída por otro proceso— y
 * una sonda por clase, no por fichero:
 *
 *  · CONTROLES DE HALLAZGOS: listan un hallazgo por línea, sin tope, y salen
 *    con 1. Representante: `inyeccion-explicita.mjs`, que acepta un árbol.
 *  · RESÚMENES DE SUITE: el paso 14, la suite negativa, los recuentos.
 *    Representante: `estabilidad.mjs`, con una suite falsa.
 *
 * Las dos se leen con el lector lento de la 15-S2 (`lector-lento.mjs`): con
 * `process.exit` la salida llega cortada en el mismo byte; con `exitCode`,
 * entera, con su última línea.
 *
 * Vive en `sondas/` por lo mismo que las demás (`ficheros-caidos.mjs`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conLectorLento } from '../lector-lento.mjs';

const MUCHOS = 600;

export const sondasDeLectorLentoPorClase = async ({ raiz, banco, ok, mal, controles }) => {
  // Clase 1 · un controlador con 600 parámetros sin @Inject: ~60 KB de hallazgos.
  const arbol = join(banco, 'lector-lento-hallazgos');
  mkdirSync(arbol, { recursive: true });
  const parametros = Array.from({ length: MUCHOS }, (_, i) => `p${String(i)}: CasoDeUso`);
  writeFileSync(
    join(arbol, 'sonda.module.ts'),
    "import { Controller, Module } from '@nestjs/common';\n" +
      'class CasoDeUso {}\n' +
      `@Controller('sonda') export class SondaController { constructor(${parametros.join(', ')}) {} }\n` +
      '@Module({ controllers: [SondaController] }) export class SondaModule {}\n',
  );
  const h = await conLectorLento('node', [controles.hallazgos, arbol], {
    cwd: raiz,
    env: process.env,
    esperaMs: 5000,
    conError: true,
  });
  h.codigo === 1 && /p599: CasoDeUso/.test(h.salida) && /Añada `@Inject\(Clase\)`/.test(h.salida)
    ? ok(
        `controles de hallazgos: ${String(h.salida.length)} bytes enteros con un lector lento, y sale con 1`,
      )
    : mal(
        `un control de hallazgos pierde su salida con un lector lento: ${String(h.salida.length)} bytes, código ${String(h.codigo)} (DT-15S2-11)`,
      );

  // Clase 2 · una suite que en su segunda pasada suelta 600 rojas: «solo en la 2», sin tope.
  const informes = join(raiz, '.informes-de-prueba');
  const rojas = Array.from({ length: MUCHOS }, (_, i) => ({
    status: 'failed',
    fullName: `sonda del lector lento > roja ${String(i)}`,
    title: `roja ${String(i)}`,
    failureMessages: ['x'],
  }));
  const contador = join(banco, 'contador-lector-lento');
  const suite = join(banco, 'suite-lector-lento.sh');
  writeFileSync(
    suite,
    [
      '#!/usr/bin/env bash',
      `n=$(cat "${contador}" 2>/dev/null || echo 0)`,
      `echo $((n + 1)) > "${contador}"`,
      `mkdir -p "${informes}"`,
      'if [ "$n" -eq 1 ]; then',
      `cat > "${join(informes, 'sonda.json')}" <<'JSON'`,
      JSON.stringify({
        testResults: [{ name: join(raiz, 'test/x.test.ts'), assertionResults: rojas }],
      }),
      'JSON',
      '  echo "   Tests  600 failed (600)"; exit 1',
      'fi',
      `echo '{"testResults":[]}' > "${join(informes, 'sonda.json')}"`,
      'echo "   Tests  600 passed (600)"',
    ].join('\n'),
  );
  chmodSync(suite, 0o755);
  const r = await conLectorLento(
    'node',
    [controles.resumen, '--repeticiones', '2', '--comando', suite],
    {
      cwd: raiz,
      env: process.env,
      esperaMs: 5000,
      conError: true,
    },
  );
  r.codigo === 1 && /roja 599/.test(r.salida) && /FALLO estabilidad/.test(r.salida)
    ? ok(
        `resúmenes de suite: ${String(r.salida.length)} bytes enteros con un lector lento, y sale con 1`,
      )
    : mal(
        `un resumen de suite pierde su final con un lector lento: ${String(r.salida.length)} bytes, código ${String(r.codigo)} (DT-15S2-11)`,
      );

  rmSync(join(informes, 'sonda.json'), { force: true });
  rmSync(join(informes, 'estabilidad'), { recursive: true, force: true });
};
