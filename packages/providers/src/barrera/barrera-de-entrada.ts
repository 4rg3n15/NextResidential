import type { ControlDeBarrera, ResultadoDeAccionamiento } from '@ncr/domain-core';
import { ordenAceptada, ordenInalcanzable, ordenRechazada } from '@ncr/domain-core';
import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { booleano, entero, etiqueta } from '../equipo/xml';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS DOS BARRERAS HABLAN IDIOMAS DISTINTOS
 *
 * No son la misma orden con otra ruta: son **dos vocabularios**, y confundirlos
 * produce una petición que el equipo acepta sintácticamente y no ejecuta.
 *
 * | Familia de ruta | Subir  | Bajar   | Detener | Bloquear  |
 * | --------------- | ------ | ------- | ------- | --------- |
 * | Aparcamiento    | `open` | `close` | —       | `lock`    |
 * | Entrada y salida| `on`   | `off`   | `stop`  | `locked`  |
 *
 * El de aparcamiento es el **VERIFICADO** contra el equipo el 15/09/2026 y
 * sigue siendo el camino principal (`ControlDeBarreraVehicular`). Éste es el
 * repliegue documentado para un modelo que no lo admita.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LAS ERRATAS SON DEL FABRICANTE Y SE RESPETAN
 *
 * `barrietGateNum` y `barrietGateOper` — sin la «r» — son los nombres que el
 * esquema declara y **los que el equipo espera**. Corregirlos produce una
 * petición que el aparato no entiende y un error que no dice por qué. Queda
 * escrito aquí para que dentro de seis meses nadie las «arregle».
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * Y UN HUECO DEL VOCABULARIO, DICHO EN VEZ DE DISIMULADO
 *
 * Este vocabulario tiene `locked` y **no tiene su contrario**. Devolver
 * `unlock` de la otra familia sería inventar una operación; devolver `stop` y
 * llamarlo desbloqueo sería peor, porque el equipo lo aceptaría. Se rechaza con
 * el motivo escrito: en este modelo, el desbloqueo se hace en el aparato.
 */

/** Operaciones del vocabulario de entrada y salida. */
export type OperacionDeEntrada = 'on' | 'off' | 'stop' | 'locked';

/**
 * Cuerpo de la orden. Las erratas del esquema son literales: ver arriba.
 */
export const cuerpoDeBarreraDeEntrada = (numero: number, operacion: OperacionDeEntrada): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<BarrierGateCtrl version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">',
    `<barrietGateNum>${String(numero)}</barrietGateNum>`,
    '<BarrierGateCtrlList>',
    `<barrietGateOper>${operacion}</barrietGateOper>`,
    '</BarrierGateCtrlList>',
    '</BarrierGateCtrl>',
  ].join('');

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ESTADO DE LA BARRERA · y lo que NO significa
 *
 * `0` sin señal · `1` **cerrada** · `2` **abierta**. Se escribe aquí porque el
 * orden no es el intuitivo: 1 es cerrada, no abierta, y un mapeo invertido
 * produce una consola que muestra el brazo al revés sin que nada falle.
 *
 * Y la invariante que no cambia (H-1, H-2): leer «abierta» dice que el brazo
 * está arriba, **no que un vehículo pasara**. Sin señal de posición cableada,
 * el sistema sigue sin poder afirmar paso franqueado.
 */
export type EstadoDeBarrera = 'sin_senal' | 'cerrada' | 'abierta' | 'desconocido';

const POR_VALOR: Readonly<Record<string, EstadoDeBarrera>> = {
  '0': 'sin_senal',
  '1': 'cerrada',
  '2': 'abierta',
};

export const leerEstadoDeBarrera = (cuerpo: string): EstadoDeBarrera => {
  const valor = entero(etiqueta(cuerpo, 'barrierGateStatus'));
  return valor === null ? 'desconocido' : (POR_VALOR[String(valor)] ?? 'desconocido');
};

/**
 * ¿Este modelo reporta el estado del brazo?
 *
 * Se pregunta **antes** de sondearlo. Un modelo que no lo soporta contesta con
 * un rechazo cuyo texto no distingue «no lo tengo» de «ahora no puedo», y una
 * consola que sondea a ciegas acaba mostrando un estado desconocido permanente
 * que parece una avería. Devuelve `null` cuando el equipo no lo declara: no es
 * lo mismo que declarar que no.
 */
export const reportaEstadoDeBarrera = (capacidades: string): boolean | null =>
  booleano(etiqueta(capacidades, 'isSupportBarrierGateStatus'));

export interface OpcionesDeBarreraDeEntrada extends OpcionesDeEquipo {
  /** Cuál de las barreras del equipo. Se lee del equipo, no se supone. */
  readonly numeroDeBarrera?: number;
  /** Ruta a la que se envía la orden, del catálogo. */
  readonly ruta: string;
}

const CODIGO_DE_ACEPTACION = 1;

/**
 * Repliegue documentado de la barrera, con el vocabulario de entrada y salida.
 *
 * Implementa el MISMO puerto del dominio que el adaptador verificado: para
 * quien lo usa son intercambiables, y esa es la única forma de que cambiar de
 * modelo no se note fuera de este paquete.
 */
export class BarreraDeEntrada implements ControlDeBarrera {
  private readonly cliente: ClienteDeEquipo;

  constructor(private readonly opciones: OpcionesDeBarreraDeEntrada) {
    this.cliente = new ClienteDeEquipo(opciones);
  }

  async accionar(_dispositivoId: string, abrir: boolean): Promise<ResultadoDeAccionamiento> {
    return this.ordenar(abrir ? 'on' : 'off');
  }

  async fijarBloqueo(
    _dispositivoId: string,
    bloqueado: boolean,
  ): Promise<ResultadoDeAccionamiento> {
    if (!bloqueado) {
      // Ver la nota de arriba: este vocabulario no tiene desbloqueo. Se dice.
      return ordenRechazada(
        'Este modelo no admite desbloquear la barrera por la ruta de entrada: su vocabulario ' +
          'sólo declara bloquear. El desbloqueo se hace en el propio aparato',
        0,
      );
    }
    return this.ordenar('locked');
  }

  private async ordenar(operacion: OperacionDeEntrada): Promise<ResultadoDeAccionamiento> {
    try {
      const respuesta = await this.cliente.pedir('PUT', this.opciones.ruta, {
        tipo: 'application/xml',
        contenido: cuerpoDeBarreraDeEntrada(this.opciones.numeroDeBarrera ?? 1, operacion),
      });
      const codigo = entero(etiqueta(respuesta.cuerpo, 'statusCode'));
      if (respuesta.ok && (codigo === CODIGO_DE_ACEPTACION || codigo === 0)) {
        // H-1 · aceptada NO es abierta, aquí tampoco.
        return ordenAceptada(respuesta.latenciaMs);
      }
      const texto = etiqueta(respuesta.cuerpo, 'statusString');
      return ordenRechazada(
        texto ?? `El equipo no aceptó la orden (HTTP ${String(respuesta.estado)})`,
        respuesta.latenciaMs,
      );
    } catch (error) {
      if (error instanceof EquipoInalcanzable) {
        return ordenInalcanzable(error.detalle, error.latenciaMs);
      }
      throw error;
    }
  }
}
