import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara, opcionesDeEscritura } from '../equipo/catalogo-de-rutas';
import { confirmada } from '../equipo/confirmacion-isapi';
import { motivoLegible } from '../nucleo/motivo-legible';
import { TerminalFacial } from '../terminal/terminal-facial';
import { Videoportero } from '../videoportero/videoportero';
import { resultado } from './tipos';
import type { OpcionesDeEnsayo, ResultadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · PASO 5 · LO QUE MUEVE, SIEMPRE CON UNA PERSONA DELANTE
 *
 * La apertura es la de PRODUCCIÓN, que lleva el cuerpo DEMOSTRADO en sitio
 * (anexo 15-K): el mismo documento y el mismo Content-Type. Y «aceptada» no
 * basta: dos de las tres respuestas engañosas de sitio son
 * aceptaciones —«OK» sin namespace y 2xx sin `statusCode 1`— con el relé
 * quieto. Por eso la última palabra es de quien MIRA la puerta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const UMBRAL_DE_APERTURA_MS = 3000; // KPI-13 y KPI-32

const SOLO_LECTURA = 'Modo solo lectura: no se acciona ni se escribe nada en el equipo';

const juzgarMovimiento = async (
  o: OpcionesDeEnsayo,
  pregunta: string,
  latenciaMs: number | null,
  detalle: readonly string[],
): Promise<ResultadoDePaso> => {
  const movio = await o.interlocutor.confirmar(pregunta);
  const ms = latenciaMs === null ? '' : ` en ${String(Math.round(latenciaMs))} ms`;
  if (movio === null) {
    return resultado(
      'apertura',
      'fallo',
      `El equipo aceptó la orden${ms}, pero nadie confirmó que se moviera`,
      'Repita con alguien mirando la puerta: sin esa respuesta no hay verificación',
      detalle,
    );
  }
  if (!movio) {
    return resultado(
      'apertura',
      'fallo',
      `El equipo contestó que sí${ms} y NO se movió (respuesta engañosa de sitio)`,
      'Compruebe el número de puerta o carril (*_CANAL en el .env y la ficha del equipo) y el ' +
        'cableado del relé; repita con --capturar y conserve la carpeta',
      detalle,
    );
  }
  if (latenciaMs !== null && latenciaMs > UMBRAL_DE_APERTURA_MS) {
    return resultado(
      'apertura',
      'fallo',
      `Se movió, pero la orden tardó ${String(Math.round(latenciaMs))} ms (límite 3 s)`,
      'Revise la red entre el Mac y el equipo (Wi-Fi saturada, cable, VLAN)',
      detalle,
    );
  }
  return resultado(
    'apertura',
    'ok',
    `Orden aceptada${ms} y la persona vio moverse la puerta`,
    null,
    detalle,
  );
};

export const pasoDeApertura = async (o: OpcionesDeEnsayo): Promise<ResultadoDePaso> => {
  if (o.soloLectura) return resultado('apertura', 'omitido', SOLO_LECTURA);
  const { equipo } = o;
  if (equipo.familia === 'camara') {
    const ruta = rutaPara('accionar la barrera vehicular', 'camara', equipo.puerta);
    await o.interlocutor.indicar('Mire la talanquera: se va a levantar');
    try {
      const r = await new ClienteDeEquipo(equipo).pedir(
        ruta.metodo,
        ruta.ruta,
        ruta.cuerpo,
        opcionesDeEscritura(ruta),
      );
      if (!confirmada(r)) {
        return resultado(
          'apertura',
          'fallo',
          `La cámara no confirmó la orden (HTTP ${String(r.estado)} sin «statusCode 1»)`,
          'Compruebe el carril (BARRERA_CANAL) y que el relé 1 sea «Abrir» en el panel web',
        );
      }
      return juzgarMovimiento(o, '¿Se levantó la talanquera?', r.latenciaMs, []);
    } catch (error) {
      return resultado('apertura', 'fallo', motivoLegible(error), 'Repita tras corregir la causa');
    }
  }
  /**
   * Con el ADAPTADOR DE PRODUCCIÓN —el de portería y guardia (A1)—, que
   * comparte la sesión Digest del equipo. Una sesión nueva empezaría su
   * contador en `nc=1` sobre el mismo nonce que ya usaron las lecturas, y el
   * equipo lo toma por una réplica (`stale`). El intercambio crudo 401 → 200
   * lo sigue enseñando `puesta-en-marcha-equipos.mjs --abrir`.
   */
  const puerta =
    equipo.familia === 'terminal'
      ? new TerminalFacial({ ...equipo, modo: 'reporta_y_espera', numeroDePuerta: equipo.puerta })
      : new Videoportero({ ...equipo, numeroDePuerta: equipo.puerta });
  await o.interlocutor.indicar(`Mire la puerta ${String(equipo.puerta)}: se va a abrir`);
  try {
    const r = await puerta.abrir('ensayo-en-sitio', 'ensayo-en-sitio');
    if (!r.aceptado) {
      return resultado(
        'apertura',
        'fallo',
        'El equipo no aceptó la orden de apertura',
        'Compruebe el número de puerta (*_CANAL y la ficha) y que el usuario de servicio pueda abrir',
      );
    }
    return juzgarMovimiento(o, `¿Se movió la puerta ${String(equipo.puerta)}?`, r.latenciaMs, []);
  } catch (error) {
    const texto = error instanceof Error ? error.message : '';
    return resultado(
      'apertura',
      'fallo',
      motivoLegible(error),
      /badXmlContent/.test(texto)
        ? 'Algo entre el Mac y el equipo le quita el cuerpo a la petición (antivirus, proxy): ' +
            'conecte el Mac directo a la red de los equipos'
        : 'Compruebe el número de puerta (*_CANAL y la ficha) y que el usuario de servicio pueda abrir',
    );
  }
};

// J1 · PASO 6 · el rostro de prueba vive en `paso-de-rostro.ts` (C7 y F4, 15-L).
export { pasoDeRostro } from './paso-de-rostro';
