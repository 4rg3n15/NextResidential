import type { AccessPointProvider, ResultadoAccionamiento } from '@ncr/domain-core';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { comoErrorNeutral } from '../equipo/errores-del-fabricante';

/**
 * VIDEOPORTERO · `DS-KD9633-WBE6` · V2.3.9 build 230905.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TODAS SUS RUTAS SON **DOCUMENTADAS, NO VERIFICADAS**
 *
 * Incluida la de apertura, que **parece** la misma que la de la terminal facial
 * y está catalogada aparte a propósito. Dar por hecho que dos familias
 * comparten ruta es exactamente la analogía que este repositorio prohíbe, y la
 * que costó dos intentos contra la cámara. Se confirman con el guion de puesta
 * en marcha.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA APERTURA LA ATRIBUYE EL SISTEMA, NO EL EQUIPO (RN-08, CA-20)
 *
 * `abrir` recibe el `actorId` y **lo exige**: una apertura remota sin operador
 * identificado es justo el hecho que un incidente necesita reconstruir. El
 * equipo no sabe quién la pidió y nunca lo sabrá; quien lo sabe es el evento
 * que `RegistrarAcceso` escribe, y por eso el motivo y el operador no viajan
 * hasta aquí: viajan al histórico. Este adaptador sólo mueve el relé.
 */
export class VideoporteroSinOperador extends Error {
  constructor() {
    super('Una apertura remota sin operador identificado no se ejecuta (RN-08, CA-20)');
    this.name = 'VideoporteroSinOperador';
  }
}

export interface OpcionesDeVideoportero extends OpcionesDeEquipo {
  /** Qué puerta abre. Declarada en el alta; sin ella no se abre (D4). */
  readonly numeroDePuerta?: number | null;
}

export class Videoportero implements AccessPointProvider {
  private readonly cliente: ClienteDeEquipo;

  constructor(private readonly opciones: OpcionesDeVideoportero) {
    this.cliente = new ClienteDeEquipo(opciones);
  }

  async abrir(dispositivoId: string, actorId: string): Promise<ResultadoAccionamiento> {
    // Se comprueba AQUÍ, delante de la llamada al equipo, no después: la
    // diferencia entre una puerta con trazabilidad y una puerta con un campo
    // de texto al lado es que la orden no se ejecuta.
    if (actorId.trim() === '') throw new VideoporteroSinOperador();

    const ruta = rutaPara(
      'abrir la puerta del videoportero',
      'videoportero',
      this.opciones.numeroDePuerta ?? undefined,
    );
    try {
      const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta, {
        tipo: 'application/xml',
        contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
      });
      // Un rechazo del equipo sale con su clase neutral: ocupado se reintenta,
      // credencial no, avería tampoco. «aceptado: false» a secas escondía cuál.
      const codigo = /<statusCode>\s*(\d+)\s*<\/statusCode>/i.exec(respuesta.cuerpo)?.[1];
      if (!respuesta.ok || (codigo !== undefined && codigo !== '0' && codigo !== '1')) {
        throw comoErrorNeutral(dispositivoId, respuesta.cuerpo, respuesta.estado);
      }
      return { aceptado: true, latenciaMs: respuesta.latenciaMs };
    } catch (error) {
      if (error instanceof EquipoInalcanzable) {
        return { aceptado: false, latenciaMs: error.latenciaMs };
      }
      throw error;
    }
  }

  async estado(_dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'> {
    const ruta = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'videoportero');
    try {
      const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta);
      if (respuesta.estado === 401) return 'degradado';
      return respuesta.ok ? 'en_linea' : 'degradado';
    } catch {
      return 'fuera_de_linea';
    }
  }
}
