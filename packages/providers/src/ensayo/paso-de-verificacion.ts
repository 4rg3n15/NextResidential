import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo, ResultadoDePaso, VerificacionMedida } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F2 (corrección de la 15-L) · PASO 9 · ¿LLEGA EL VEREDICTO ANTES DE QUE LA
 * TERMINAL SE CANSE DE ESPERAR?
 *
 * Con la verificación remota, la terminal reconoce la cara, pregunta a la
 * plataforma y ESPERA; pasado su plazo (`remoteCheckTimeout`, que la consola
 * escribe con `TERMINAL_PLAZO_DE_VERIFICACION_S`) niega, aunque la plataforma
 * fuera a decir que sí. En sitio eso se ve como «a veces no abre», y nadie lo
 * relaciona con un tiempo.
 *
 * Se pide a la persona que presente el rostro CINCO veces y se leen de la base
 * las cinco duraciones que la API registró (del hecho recibido al veredicto
 * contestado). Se informan p50 y p95 contra el plazo: si el p95 lo alcanza, una
 * de cada veinte personas se queda fuera.
 *
 * El percentil es el MÁS CERCANO con redondeo hacia arriba —el mismo método que
 * los tableros de la API (`observabilidad/aplicacion/percentiles.ts`)—: nunca
 * devuelve una duración que no se midió. Con cinco muestras, el p95 es la peor.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const PRESENTACIONES_POR_OMISION = 5;
export const PLAZO_DE_VERIFICACION_POR_OMISION_S = 8;

/** Percentil más cercano (`ceil(p/100 · n) − 1` sobre una copia ordenada). `null` sin muestras. */
export const percentil = (muestras: readonly number[], p: number): number | null => {
  const ordenadas = [...muestras].sort((a, b) => a - b);
  if (ordenadas.length === 0) return null;
  const indice = Math.ceil((Math.min(Math.max(p, 0), 100) / 100) * ordenadas.length) - 1;
  return ordenadas[Math.min(Math.max(indice, 0), ordenadas.length - 1)] ?? null;
};

export const ACCION_DE_VERIFICACION_LENTA =
  'Si sólo la primera es lenta, es el arranque en frío: haga una verificación de prueba nada ' +
  'más arrancar la API (precalentamiento). Si todas lo son, es la red: el Mac por cable en la ' +
  'red de la terminal, sin VPN ni Wi-Fi saturada. Si aun así no baja del plazo, plan B: en la ' +
  'consola, página de la terminal, «Verificación remota: desactivar»';

const ms = (n: number | null): string => (n === null ? '—' : `${String(Math.round(n))} ms`);

/** El juicio, puro: las medidas contra el plazo. */
export const juzgarVerificaciones = (
  medidas: readonly VerificacionMedida[],
  pedidas: number,
  plazoS: number,
): ResultadoDePaso => {
  const duraciones = medidas.map((m) => m.duracionMs);
  const p50 = percentil(duraciones, 50);
  const p95 = percentil(duraciones, 95);
  const detalle = [
    `duraciones: ${duraciones.map((d) => String(Math.round(d))).join(', ') || '—'} ms`,
    `plazo de la terminal: ${String(plazoS)} s (TERMINAL_PLAZO_DE_VERIFICACION_S)`,
  ];
  const cifras = `p50 ${ms(p50)} · p95 ${ms(p95)}`;
  if (medidas.length === 0) {
    return resultado(
      'verificacion',
      'fallo',
      'La plataforma no registró ningún veredicto para esta terminal',
      'Compruebe que la persona esté dada de alta con rostro, que la terminal espere el ' +
        'veredicto (paso 3) y que la API la escuche (bitácora, líneas «escucha:»); repita',
      detalle,
    );
  }
  if (p95 !== null && p95 >= plazoS * 1000) {
    return resultado(
      'verificacion',
      'fallo',
      `${cifras}: el p95 alcanza el plazo de la terminal (${String(plazoS)} s) y ésta niega sola`,
      ACCION_DE_VERIFICACION_LENTA,
      detalle,
    );
  }
  const rechazados = medidas.filter((m) => m.aceptado === false).length;
  if (rechazados > 0) {
    return resultado(
      'verificacion',
      'fallo',
      `${cifras}, pero la terminal NO aceptó ${String(rechazados)} de ${String(medidas.length)} ` +
        'veredictos (le llegaron tarde o para otra consulta)',
      ACCION_DE_VERIFICACION_LENTA,
      detalle,
    );
  }
  if (medidas.length < pedidas) {
    return resultado(
      'verificacion',
      'fallo',
      `${cifras}, pero sólo ${String(medidas.length)} de ${String(pedidas)} presentaciones ` +
        'llegaron a veredicto: las que faltan, la terminal las negó sin respuesta',
      'Repita las presentaciones; si siguen faltando, mire la bitácora de la API (líneas ' +
        '«escucha:») y la red entre el Mac y la terminal',
      detalle,
    );
  }
  return resultado(
    'verificacion',
    'ok',
    `${cifras}, por debajo del plazo de la terminal (${String(plazoS)} s)`,
    null,
    detalle,
  );
};

export const pasoDeVerificacion = async (
  o: OpcionesDeEnsayo,
  capacidades: CapacidadesDeEquipo | null,
): Promise<ResultadoDePaso> => {
  if (o.equipo.familia !== 'terminal') {
    return resultado(
      'verificacion',
      'no_aplica',
      'Sólo la terminal espera el veredicto de la plataforma',
    );
  }
  if (o.verificaciones === undefined) {
    return resultado(
      'verificacion',
      'omitido',
      'Sin la base de la plataforma (--sin-plataforma o sin DATABASE_URL) no se leen los ' +
        'tiempos que registra la API',
      'Repita con la API en marcha y DATABASE_URL en apps/api/.env',
    );
  }
  if (capacidades?.verificacionRemota !== 'si') {
    return resultado(
      'verificacion',
      'omitido',
      'La terminal no espera el veredicto de la plataforma (verificación remota desactivada ' +
        'o sin leer): no hay tiempos que medir',
      'Mire el paso 3: «quién decide la apertura»',
    );
  }
  const pedidas = o.presentaciones ?? PRESENTACIONES_POR_OMISION;
  const plazoS = o.plazoDeVerificacionS ?? PLAZO_DE_VERIFICACION_POR_OMISION_S;
  const desde = o.ahora();
  await o.interlocutor.indicar(
    `Presente el rostro de una persona dada de alta a la terminal ${String(pedidas)} veces, ` +
      `una tras otra. Se espera hasta ${String(Math.round(o.esperaDeEventoMs / 1000))} s`,
  );
  const medidas = await o.verificaciones.medidasDesde(
    o.equipo.host,
    desde,
    pedidas,
    o.esperaDeEventoMs,
  );
  return juzgarVerificaciones(medidas, pedidas, plazoS);
};
