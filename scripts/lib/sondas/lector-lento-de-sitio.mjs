/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SONDA 22 quater · 15-S6 · DT-15S5-01 y DT-15S5-02 · LOS GUIONES DE SITIO
 * ENTREGAN SU VEREDICTO A UN LECTOR LENTO
 *
 * `sitio-ensayo` (paso 12f: lee «VEREDICTO» por texto), `puesta-en-marcha-
 * equipos` (paso 12e y sonda 38) y `sitio-audio` terminaban con `process.exit`
 * tras más de 16 KB. En macOS la tubería es de 16 KB: el lector podía quedarse
 * sin el veredicto con el ensayo en verde (DT-15S5-01, -02). Medido en la
 * 15-S6 en Linux con una tubería de 4 KiB y un lector parado: llegaban 4007 y
 * 4081 bytes, sin veredicto.
 *
 * Aquí cada guion corre en `--simulado` con el lector lento de la 15-S2, y se
 * exige que llegue entero: su última línea y, en el que pasa de 16 KB
 * (`puesta-en-marcha`, 18 KB; `sitio-ensayo` queda en 15,8 KB), más de 16 KB. En Linux el búfer del socket (~27 KB, 15-S5) deja pasar estos
 * tamaños aunque el guion usara `process.exit`: la sonda muerde en macOS y es
 * holgada aquí. Se dice, en vez de fingir lo contrario.
 *
 * Vive en `sondas/` por lo mismo que las demás (`ficheros-caidos.mjs`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { join } from 'node:path';
import { conLectorLento } from '../lector-lento.mjs';

const DIECISEIS_KB = 16 * 1024;

export const sondasDeLectorLentoDeSitio = async ({ raiz, banco, ok, mal }) => {
  const guiones = [
    {
      nombre: 'sitio-ensayo',
      args: ['scripts/sitio-ensayo.mjs', '--simulado'],
      ultima: /VEREDICTO: SIN FALLOS/,
      // 15,8 KB por el socket (16,4 KB por tubería): al borde, no por encima.
      grande: false,
    },
    {
      nombre: 'puesta-en-marcha-equipos',
      args: [
        'scripts/puesta-en-marcha-equipos.mjs',
        '--simulado',
        '--con-audio',
        `--informe=${join(banco, 'lento-puesta.md')}`,
        `--hoja=${join(banco, 'lento-hoja.md')}`,
      ],
      ultima: /Rellénela delante de los equipos/,
      grande: true,
    },
    {
      nombre: 'sitio-audio',
      args: ['scripts/sitio-audio.mjs', '--simulado', `--informe=${join(banco, 'lento-audio.md')}`],
      ultima: /^informe: /m,
      grande: false,
    },
  ];
  for (const g of guiones) {
    // Sin la cobertura del paso 9 (ídem 41, 15-S5): los guiones de sitio y sus
    // módulos (`vispera-de-sitio`, `ensayo-plataforma`…) son herramientas, no
    // controles; medidos aquí entrarían en el trinquete de ramas sin base.
    const r = await conLectorLento('node', g.args, {
      cwd: raiz,
      env: { ...process.env, NODE_V8_COVERAGE: '' },
      esperaMs: 8000,
      conError: true,
    });
    const entera = g.ultima.test(r.salida) && (!g.grande || r.salida.length > DIECISEIS_KB);
    r.codigo === 0 && entera
      ? ok(
          `${g.nombre} --simulado: ${String(r.salida.length)} bytes enteros con un lector lento` +
            `${g.grande ? ' (> 16 KB)' : ''}, y sale con 0`,
        )
      : mal(
          `${g.nombre} --simulado pierde su final con un lector lento: ${String(r.salida.length)} ` +
            `bytes, código ${String(r.codigo)} (DT-15S5-01/02)`,
        );
  }
};
