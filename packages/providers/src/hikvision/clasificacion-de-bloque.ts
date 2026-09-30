import type { BloqueDeAlertStream, ClaseDeEvento } from './contratos-de-evento';
import { esCodigoDeRostro, eventoDeLlamada, eventoPorCodigo } from './catalogo-de-eventos';
import type { TipoDeEventoDeEquipo } from './catalogo-de-eventos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ ES UN BLOQUE, POR LO QUE TRAE · ETAPA 15-L (Bloque B)
 *
 * Hasta la 15-L todo `AccessControllerEvent` era un «rostro»: la puerta que se
 * abre, el botón de salida, el timbre de la terminal o un sabotaje entraban al
 * motor de reglas como si alguien pidiera paso, y el motor —sin persona— los
 * negaba. Un falso «acceso negado» en una tabla que no se puede corregir.
 *
 * Ahora manda el par `majorEventType`/`subEventType` del catálogo:
 *
 *  · `rostro` — sólo lo que PIDE una decisión: la terminal pregunta
 *    (`remoteCheck`) o reconoció a alguien (5/75, 5/77, 5/146). Sin códigos
 *    (firmwares que no los emiten, [SUPUESTO] S-36) se mantiene la regla de la
 *    15-D: con persona es un rostro.
 *  · `timbre` — el de la terminal (5/37) o el `doorbell` del videoportero.
 *  · `llamada` — el `VoiceTalkEvent` y su familia.
 *  · `equipo` — todo lo demás que el catálogo reconoce, y el resultado de una
 *    verificación ya contestada. No es un acceso: se guarda y se enseña.
 *  · `desconocido` — lo que no se sabe leer. También se guarda.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface Clasificacion {
  readonly clase: ClaseDeEvento;
  readonly tipo: TipoDeEventoDeEquipo;
  readonly titulo: string;
  readonly codigo: { readonly mayor: number; readonly menor: number } | null;
}

const numero = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : null;
};

export const clasificarBloque = (bloque: BloqueDeAlertStream): Clasificacion => {
  const tipoDelEquipo = bloque.eventType ?? '';
  const placa = bloque.ANPR?.licensePlate ?? null;
  if (placa !== null && placa !== '') {
    return { clase: 'placa', tipo: 'lectura_de_placa', titulo: 'Lectura de placa', codigo: null };
  }

  const acceso = bloque.AccessControllerEvent;
  if (acceso !== undefined || /AccessController/i.test(tipoDelEquipo)) {
    const mayor = numero(acceso?.majorEventType);
    const menor = numero(acceso?.subEventType);
    const codigo = mayor === null || menor === null ? null : { mayor, menor };
    const persona = acceso?.employeeNoString ?? acceso?.employeeNo;
    const conPersona = persona !== undefined && String(persona).trim() !== '';

    if (acceso?.remoteCheckResult !== undefined || /remoteCheckResult/i.test(tipoDelEquipo)) {
      return {
        clase: 'equipo',
        tipo: 'resultado_de_verificacion',
        titulo: 'Resultado de la verificación remota',
        codigo,
      };
    }
    if (acceso?.remoteCheck === true) {
      const del = codigo === null ? null : eventoPorCodigo(codigo.mayor, codigo.menor);
      return {
        clase: 'rostro',
        tipo: del?.tipo === 'rostro_capturado_para_verificacion' ? del.tipo : 'rostro_reconocido',
        titulo: 'La terminal pregunta si abre',
        codigo,
      };
    }
    if (codigo !== null) {
      const del = eventoPorCodigo(codigo.mayor, codigo.menor);
      if (del.tipo === 'timbre') return { clase: 'timbre', ...del, codigo };
      // G3 (15-N) · la llamada que llega como evento de control de acceso (5/51)
      // sigue el camino de la llamada, no el de un evento cualquiera.
      if (del.tipo === 'llamada') return { clase: 'llamada', ...del, codigo };
      const pideDecision = esCodigoDeRostro(codigo.mayor, codigo.menor) && conPersona;
      return { clase: pideDecision ? 'rostro' : 'equipo', ...del, codigo };
    }
    return conPersona
      ? { clase: 'rostro', tipo: 'rostro_reconocido', titulo: 'Rostro reconocido', codigo: null }
      : {
          clase: 'desconocido',
          tipo: 'desconocido',
          titulo: 'Evento de control de acceso sin código',
          codigo: null,
        };
  }

  if (
    bloque.VoiceTalkEvent !== undefined ||
    bloque.voiceTalkEvent !== undefined ||
    bloque.CallInfo !== undefined ||
    /videoIntercom|callSignal|voiceTalk/i.test(tipoDelEquipo)
  ) {
    const llamada = eventoDeLlamada(bloque.VoiceTalkEvent?.cmdType);
    return { clase: 'llamada', ...llamada, codigo: null };
  }
  if (/doorbell/i.test(tipoDelEquipo)) {
    return { clase: 'timbre', tipo: 'timbre', titulo: 'Timbre', codigo: null };
  }
  const nombre = tipoDelEquipo.trim().slice(0, 40);
  return {
    clase: 'desconocido',
    tipo: 'desconocido',
    titulo: nombre === '' ? 'Evento del equipo sin tipo' : `Evento del equipo (${nombre})`,
    codigo: null,
  };
};
