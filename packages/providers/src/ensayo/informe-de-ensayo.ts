import type { InformeDeEnsayo } from './ensayo-en-sitio';
import { ROTULO } from './tipos';
import type { EstadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · LO QUE SE IMPRIME: OK / FALLO POR PASO, CAUSA Y ACCIÓN
 *
 * Y NUNCA UNA CREDENCIAL. Ningún paso la pone en su texto, pero un mensaje del
 * equipo o de la red podría traerla de vuelta; por eso toda línea pasa por
 * `sinSecretos` con los valores que el guion conoce (claves, usuario de la
 * base) antes de salir. Es un cinturón además de los tirantes.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const PALABRA: Readonly<Record<EstadoDePaso, string>> = {
  ok: 'OK',
  fallo: 'FALLO',
  omitido: 'OMITIDO',
  no_aplica: 'NO APLICA',
};

export const sinSecretosConocidos = (texto: string, secretos: readonly string[]): string =>
  secretos.filter((s) => s.length >= 3).reduce((t, s) => t.split(s).join('••••'), texto);

export const lineasDelInforme = (i: InformeDeEnsayo, secretos: readonly string[]): string[] => {
  const identidad = [i.modelo, i.firmware].filter((x) => x !== null).join(' · ');
  const nombre = i.nombre === undefined ? '' : ` «${i.nombre}»`;
  const lineas = [`── ${ROTULO[i.familia]}${nombre}${identidad === '' ? '' : ` (${identidad})`}`];
  for (const p of i.pasos) {
    lineas.push(
      `  ${String(p.numero)}. ${p.titulo.padEnd(38, '.')} ${PALABRA[p.estado]} — ${p.causa}`,
    );
    if (p.accion !== null && p.estado !== 'ok') lineas.push(`     → ${p.accion}`);
    for (const d of p.detalle) lineas.push(`       ${d}`);
  }
  return lineas.map((l) => sinSecretosConocidos(l, secretos));
};

export interface Recuento {
  readonly ok: number;
  readonly fallo: number;
  readonly omitido: number;
  readonly no_aplica: number;
}

/**
 * Los pasos de cada equipo y, además, las comprobaciones de la plataforma
 * (C1, F3): un FALLO del `.env` de la API cuenta en el veredicto como uno del
 * equipo.
 */
export const recuentoDe = (
  informes: readonly InformeDeEnsayo[],
  comprobaciones: readonly { readonly estado: EstadoDePaso }[] = [],
): Recuento => {
  const r = { ok: 0, fallo: 0, omitido: 0, no_aplica: 0 };
  for (const i of informes) for (const p of i.pasos) r[p.estado] += 1;
  for (const c of comprobaciones) r[c.estado] += 1;
  return r;
};
