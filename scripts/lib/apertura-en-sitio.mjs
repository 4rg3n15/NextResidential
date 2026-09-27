/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANEXO 15-K · `--abrir` · LA VERIFICACIÓN DE LA PRÓXIMA VISITA
 *
 * El 26/09/2026 la terminal (V4.47.0) y el videoportero (V2.3.9) ABRIERON con
 * `PUT door/1`, Content-Type `application/x-www-form-urlencoded;
 * charset=UTF-8`, el cuerpo con el espacio de nombres del fabricante y `version="2.0"`
 * y el Digest con el cuerpo desde la primera petición: 401 y después 200 con
 * `statusCode 1`. Con el cuerpo mínimo, el equipo contestó «OK» y la puerta
 * NO se movió (H-SITIO-13).
 *
 * Este modo repite esa apertura por el MISMO camino que la API
 * (`aperturaDeVerificacion`, en `@ncr/providers/operacion`), escribe cada
 * petición y cada respuesta, y PREGUNTA a la persona si la puerta se movió:
 * «aceptada» es la orden, y sólo quien mira la puerta sabe si abrió. Sin esa
 * respuesta no hay verificación, y el guion sale en 1.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createInterface } from 'node:readline/promises';

/** Pregunta en el terminal; sin terminal (CI, tubería) no hay a quién: `null`. */
export const preguntarSiSeMovio = async (rotulo) => {
  if (!process.stdin.isTTY) return null;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const r = await rl.question(`   ¿Se movió la puerta de «${rotulo}»? Mírela y conteste s/n: `);
    return /^s/i.test(r.trim()) ? 'si' : /^n/i.test(r.trim()) ? 'no' : null;
  } finally {
    rl.close();
  }
};

const peticionEnUnaLinea = (p) =>
  `${p.metodo} ${p.ruta} · ${p.tipo ?? 'sin Content-Type'} · ` +
  `${p.conCredencial ? 'con Digest' : 'sin credencial'} · ` +
  `${p.cuerpo === '' ? 'SIN cuerpo' : `cuerpo de ${String(p.cuerpo.length)} caracteres`} → HTTP ${String(p.estado)}`;

/**
 * @param {{
 *   familia: 'terminal'|'videoportero', rotulo: string, cabecera: string, kpi: string,
 *   conexion: object, puerta: number, umbralMs: number,
 *   aperturaDeVerificacion: (conexion: object, familia: string, puerta: number) => Promise<any>,
 *   seMovio: () => Promise<'si'|'no'|null>,
 *   anotar: (linea: string) => void,
 * }} e
 * @returns {Promise<boolean>} `true` si hay algo que resolver antes de dar la apertura por buena
 */
export const verificarApertura = async (e) => {
  e.anotar(`── ${e.cabecera} · puerta ${String(e.puerta)} (--abrir)`);
  const r = await e.aperturaDeVerificacion(e.conexion, e.familia, e.puerta);
  for (const p of r.peticiones) e.anotar(`   ${peticionEnUnaLinea(p)}`);
  const enviado = r.peticiones.find((p) => p.cuerpo !== '')?.cuerpo;
  if (enviado !== undefined) e.anotar(`   cuerpo enviado: ${enviado}`);
  const recibido = r.peticiones.at(-1)?.recibido;
  if (recibido !== undefined)
    e.anotar(`   última respuesta: ${recibido.replace(/\s+/g, ' ').slice(0, 400)}`);
  let problema = false;
  if (r.aceptada) {
    e.anotar(
      `   ✓ orden ACEPTADA: statusCode ${String(r.statusCode)} · subStatusCode ${String(r.subStatusCode)}` +
        (r.latenciaMs === null ? '' : ` · ${String(Math.round(r.latenciaMs))} ms`),
    );
    if (r.latenciaMs !== null && r.latenciaMs > e.umbralMs) {
      problema = true;
      e.anotar(
        `   ⚠ ${e.kpi}: ${String(Math.round(r.latenciaMs))} ms supera ${String(e.umbralMs)} ms`,
      );
    }
  } else {
    problema = true;
    e.anotar(`   ✗ orden NO aceptada: ${String(r.error)}`);
  }
  for (const d of r.desviaciones) e.anotar(`   ⚠ distinto de lo demostrado en sitio: ${d}`);
  if (r.desviaciones.length > 0) problema = true;

  if (r.aceptada) {
    const movio = await e.seMovio();
    if (movio === 'si') {
      e.anotar('   ✓ la puerta SE MOVIÓ: H-SITIO-13 verificado en este equipo');
    } else if (movio === 'no') {
      problema = true;
      e.anotar(
        '   ✗ la puerta NO se movió con la orden aceptada: H-SITIO-13 sigue abierto en este equipo.',
      );
      e.anotar(
        '     Repita con --capturar y adjunte la carpeta: el cuerpo y la respuesta están ahí.',
      );
    } else {
      problema = true;
      e.anotar(
        '   · SIN CONFIRMAR: nadie contestó si la puerta se movió. Sin esa respuesta no hay verificación.',
      );
    }
  }
  e.anotar('');
  return problema;
};
