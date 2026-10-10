/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SONDA 22 bis · 15-S5 · DT-15M-C02 · UN INFORME VIEJO NO SE LEE COMO DE ESTA
 * CORRIDA
 *
 * `metricas.mjs` leía `.informes-de-prueba/<paquete>.json` si existía, lo
 * hubiera escrito o no la corrida en curso. Si vitest moría antes de escribir,
 * culpaba de «SUITE EN ROJO» a una prueba de OTRA corrida en vez de decir
 * «CORRIDA INTERRUMPIDA».
 *
 * Se planta un informe viejo con una roja de nombre inconfundible y se corre
 * `metricas.mjs` con un `pnpm` falso delante en el `PATH`, que muere sin
 * escribir informe: es vitest muriendo, sin depender de dónde viva el `pnpm`
 * real (en el runner de GitHub no está junto a `node`, y quitar el directorio
 * de `node` del `PATH` no lo escondía). Tiene que fallar, decir que no hay
 * informe y no nombrar la roja vieja.
 *
 * Vive en `sondas/` por lo mismo que las demás (`ficheros-caidos.mjs`).
 * `control` llega como literal desde la suite.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export const sondaDeInformeViejo = ({ raiz, banco, correr, ok, mal, control }) => {
  const informes = join(raiz, '.informes-de-prueba');
  const viejo = join(informes, '-ncr-config.json');
  mkdirSync(informes, { recursive: true });
  writeFileSync(
    viejo,
    JSON.stringify({
      numTotalTests: 1,
      numFailedTests: 1,
      testResults: [
        {
          name: join(raiz, 'packages/config/src/de-otra-corrida.test.ts'),
          status: 'failed',
          assertionResults: [
            {
              status: 'failed',
              fullName: 'roja de OTRA corrida que nadie ejecutó hoy',
              title: 'roja de OTRA corrida que nadie ejecutó hoy',
              failureMessages: ['expected 1 to be 2'],
            },
          ],
        },
      ],
    }),
  );
  // Un `pnpm` que muere antes de que vitest escriba nada, delante del real.
  const falso = join(banco, 'pnpm-que-muere');
  mkdirSync(falso, { recursive: true });
  writeFileSync(join(falso, 'pnpm'), '#!/bin/sh\necho "Error: vitest murió (sonda)" >&2\nexit 1\n');
  chmodSync(join(falso, 'pnpm'), 0o755);
  try {
    const r = correr(process.execPath, [control], {
      cwd: raiz,
      timeout: 300_000,
      env: {
        ...process.env,
        PATH: `${falso}${delimiter}${process.env.PATH ?? ''}`,
        NCR_PAQUETES_METRICAS: '@ncr/config',
      },
    });
    r.codigo !== 0 &&
    /CORRIDA INTERRUMPIDA/.test(r.salida) &&
    /sin informe JSON/.test(r.salida) &&
    !/roja de OTRA corrida/.test(r.salida)
      ? ok(
          'metricas: un informe viejo no se lee como de esta corrida — sin informe, «CORRIDA INTERRUMPIDA»',
        )
      : mal(
          `metricas culpa a una prueba de OTRA corrida o no dice que falta el informe (codigo ${String(r.codigo)})`,
        );
  } finally {
    rmSync(viejo, { force: true });
  }
};
