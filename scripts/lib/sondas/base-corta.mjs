/**
 * ═════════════════════════════════════════════════════════════════════════════
 * SONDA 26 (c ter) · 15-S5 · H-15S4-01 · LA BASE MAL ARRANCADA FALLA AL PRINCIPIO
 *
 * La sonda (c bis) levanta a propósito un clúster con `max_connections=100`,
 * el de una base arrancada a mano. Antes de que `base-de-pruebas.sh` lo
 * reinicie, el control del principio del verificador tiene que rechazarlo con
 * el remedio en UNA línea; y, ya reiniciado, dejar de quejarse de eso.
 *
 * Vive en `sondas/` por lo mismo que las demás (`ficheros-caidos.mjs`).
 * `control` llega como literal desde la suite.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CONEXIONES = /admite (\d+) conexiones y la suite necesita (\d+)/;

const usar = ({ raiz, correr, control, url }, extra = []) =>
  correr('node', [control, ...extra], {
    cwd: raiz,
    env: { ...process.env, DATABASE_URL_PRUEBAS: url },
  });

/** Con el clúster a 100: FALLO, el número, el mínimo y el remedio, en una sola línea. */
export const sondaDeBaseCorta = (contexto) => {
  const { banco, ok, mal } = contexto;
  const r = usar(contexto);
  const [linea = ''] = r.salida.split('\n').filter((l) => CONEXIONES.test(l));
  r.codigo !== 0 &&
  /admite 100 conexiones y la suite necesita 200/.test(linea) &&
  /: arránquela con scripts\/base-de-pruebas\.sh$/.test(linea)
    ? ok(
        'verificar-base-de-pruebas: una base a 100 conexiones falla AL PRINCIPIO, con el remedio en una línea',
      )
    : mal(`una base a 100 conexiones pasa el control del principio (codigo ${String(r.codigo)})`);

  // Y sin el mínimo en el guion, FALLO: no un mínimo inventado.
  const guion = join(banco, 'base-sin-minimo.sh');
  writeFileSync(guion, '#!/usr/bin/env bash\nCONEXIONES="${NCR_PGMAXCONN:-300}"\n');
  const sinMinimo = usar(contexto, [guion]);
  sinMinimo.codigo !== 0 && /no leo CONEXIONES_MINIMAS/.test(sinMinimo.salida)
    ? ok('y si no puede leer el mínimo de base-de-pruebas.sh, lo dice y falla')
    : mal(`sin el mínimo legible el control no falla (codigo ${String(sinMinimo.codigo)})`);
};

/** Ya reiniciado por `base-de-pruebas.sh`: ninguna queja de conexiones (sí, aquí, de esquema). */
export const sondaDeBaseRepuesta = (contexto) => {
  const { ok, mal } = contexto;
  const r = usar(contexto);
  !CONEXIONES.test(r.salida) && /NO tiene el esquema/.test(r.salida)
    ? ok('y con el clúster reiniciado por base-de-pruebas.sh, las conexiones ya no son la queja')
    : mal('el clúster ya reiniciado sigue rechazándose por conexiones');
};
