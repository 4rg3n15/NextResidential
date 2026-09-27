import { EscuchaDeAlertStream } from '../equipo/escucha-alertstream';
import { clasificarConexionDeEventosRechazada } from '../equipo/conexion-de-eventos-rechazada';
import type { ConexionDeEventosRechazada } from '../equipo/conexion-de-eventos-rechazada';
import { ACCION_DEL_RECEPTOR, compararReceptorDelMac } from './receptor-del-mac';
import { resultado } from './tipos';
import type { FamiliaDeEnsayo, OpcionesDeEnsayo, ResultadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASO 4 · «PULSE EL TIMBRE», Y ESPERAR A QUE EL EVENTO LLEGUE
 *
 * Dos caminos, y se elige el que prueba MÁS:
 *
 *  · Con la plataforma (la API en marcha y su base a mano): se pide el gesto y
 *    se mira si el evento QUEDÓ REGISTRADO. Es extremo a extremo: la cámara
 *    publica por su servidor de alarma, la terminal y el videoportero por la
 *    escucha de la API. Y no abre una segunda suscripción: en un equipo de un
 *    solo flujo, esa segunda le quitaría los eventos a la escucha de verdad.
 *  · Sin la plataforma: el ensayo se suscribe él mismo al equipo (terminal y
 *    videoportero) y espera el primer evento EN VIVO —el volcado histórico no
 *    cuenta—. La cámara no tiene ese camino: publica hacia la API.
 *
 * C2 (corrección de la 15-L) · antes del gesto, la cámara: ¿publica en ESTE
 * Mac? Si no, el evento no puede llegar y se dice ya, sin esperar el plazo.
 * C7 · si el equipo rechaza la suscripción porque otra plataforma —HikCentral—
 * la tiene o agotó las conexiones, se dice con esas palabras y se corta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export const GESTO: Readonly<Record<FamiliaDeEnsayo, string>> = {
  camara: 'Pase el vehículo (o muestre una placa) por delante de la cámara',
  terminal: 'Acerque el rostro a la terminal',
  videoportero: 'Pulse el timbre del videoportero',
};

const hora = (d: Date, zona: string): string =>
  new Intl.DateTimeFormat('es-CO', {
    timeZone: zona,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);

const porLaPlataforma = async (o: OpcionesDeEnsayo): Promise<ResultadoDePaso> => {
  const { equipo } = o;
  const desde = o.ahora();
  await o.interlocutor.indicar(
    `${GESTO[equipo.familia]}. Se espera hasta ${String(Math.round(o.esperaDeEventoMs / 1000))} s`,
  );
  const visto = await o.plataforma?.primeroDesde(equipo.host, desde, o.esperaDeEventoMs);
  if (visto === null || visto === undefined) {
    return resultado(
      'eventos',
      'fallo',
      `En ${String(Math.round(o.esperaDeEventoMs / 1000))} s no llegó ningún evento de este ` +
        'equipo a la plataforma',
      equipo.familia === 'camara'
        ? 'En la ficha de la cámara pulse «Enviar eventos a este Mac»; en su panel, «Cargar en ' +
            'el servidor de alarmas» marcado; y que la cámara esté en ALARM_SERVER_EQUIPOS con ' +
            'el id de la consola'
        : 'Mire la bitácora de la API (líneas «escucha:»): ¿conectó con el equipo? ¿Está el ' +
            'equipo registrado en la consola con esta misma IP?',
    );
  }
  return resultado(
    'eventos',
    'ok',
    `La plataforma registró «${visto.titulo}» a las ${hora(visto.ocurridoEn, o.zona)}`,
  );
};

const porSuscripcionDirecta = async (o: OpcionesDeEnsayo): Promise<ResultadoDePaso> => {
  const { equipo } = o;
  if (equipo.familia === 'camara') {
    return resultado(
      'eventos',
      'omitido',
      'La cámara publica hacia la API (servidor de alarma), no a este ensayo',
      'Repita con la API en marcha y DATABASE_URL en apps/api/.env, o mire Eventos en la consola',
    );
  }
  const cancelar = new AbortController();
  let ocupada: ConexionDeEventosRechazada | null = null;
  const escucha = new EscuchaDeAlertStream({
    ...equipo,
    dispositivoId: 'ensayo-en-sitio',
    familia: equipo.familia,
    // Una sola conexión: reintentar aquí es presentar la credencial de nuevo.
    esperaMaximaMs: 1000,
    // C7 · el rechazo por otra plataforma corta la espera: reintentar no lo arregla.
    traza: {
      registrar: (nivel, mensaje, contexto) => {
        equipo.traza?.registrar(nivel, mensaje, contexto);
        if (mensaje !== 'escucha: el equipo rechazó la conexión') return;
        ocupada = clasificarConexionDeEventosRechazada(
          Number(contexto?.['estadoHttp']),
          String(contexto?.['cuerpo'] ?? ''),
        );
        if (ocupada !== null) cancelar.abort();
      },
    },
  });
  const plazo = setTimeout(() => cancelar.abort(), o.esperaDeEventoMs);
  try {
    await o.interlocutor.indicar(
      `${GESTO[equipo.familia]}. Se espera hasta ${String(Math.round(o.esperaDeEventoMs / 1000))} s`,
    );
    for await (const evento of escucha.escuchar(cancelar.signal)) {
      if (!evento.enVivo) continue;
      return resultado(
        'eventos',
        'ok',
        `El equipo emitió un evento en vivo (${evento.clase}) a las ${hora(evento.ocurridoEn, o.zona)}`,
        'Con la API en marcha, compruebe que también aparece en Eventos de la consola',
        [`descartados por históricos: ${String(escucha.historicosDescartados)}`],
      );
    }
  } finally {
    clearTimeout(plazo);
    cancelar.abort();
  }
  const rechazo = ocupada as ConexionDeEventosRechazada | null;
  if (rechazo !== null) {
    return resultado('eventos', 'fallo', mayuscula(rechazo.motivo), mayuscula(rechazo.remedio), [
      `descartados por históricos: ${String(escucha.historicosDescartados)}`,
    ]);
  }
  return resultado(
    'eventos',
    'fallo',
    `En ${String(Math.round(o.esperaDeEventoMs / 1000))} s el equipo no emitió ningún evento en vivo`,
    escucha.ultimaSenal() === null
      ? 'El equipo no aceptó la suscripción: compruebe que el usuario de servicio pueda ' +
          'recibir eventos (panel web → Usuarios → permisos → notificación)'
      : 'La suscripción está abierta pero el gesto no produjo evento: compruebe en el panel ' +
          'web que el evento esté habilitado (Evento → Control de acceso / Videoportero)',
    [`descartados por históricos: ${String(escucha.historicosDescartados)}`],
  );
};

const mayuscula = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);

export const pasoDeEventos = async (o: OpcionesDeEnsayo): Promise<ResultadoDePaso> => {
  const esperado = o.receptorEsperado;
  const receptor =
    o.equipo.familia === 'camara' && esperado !== undefined
      ? await compararReceptorDelMac(o.equipo, esperado)
      : null;
  if (receptor !== null && !receptor.conforme) {
    return resultado('eventos', 'fallo', receptor.causa, ACCION_DEL_RECEPTOR, receptor.detalle);
  }
  const r = o.plataforma === undefined ? await porSuscripcionDirecta(o) : await porLaPlataforma(o);
  return receptor === null ? r : { ...r, detalle: [...receptor.detalle, ...r.detalle] };
};
