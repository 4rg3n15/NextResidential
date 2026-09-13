/**
 * Puertos del módulo de guardia.
 *
 * `CanalDeIntercom` es un puerto **de aplicación**, no del dominio, y la
 * distinción importa: el puerto del dominio —`IntercomProvider`— habla de UNA
 * sesión, porque eso es lo que un operador tiene. La consola de guardia virtual
 * necesita además el estado del canal **por copropiedad y dispositivo**, que es
 * información de operación y no intención de negocio. Meterla en el puerto del
 * dominio lo haría crecer para servir a una pantalla.
 */
export interface EstadoDeCanal {
  readonly dispositivoId: string;
  readonly estado: 'abierta' | 'en_espera' | 'cerrada';
  readonly porDelante: number;
  readonly titular: string | null;
  readonly timeoutSegundos: number;
}

export interface CanalDeIntercom {
  pedir(copropiedadId: string, dispositivoId: string, operadorId: string): Promise<EstadoDeCanal>;
  soltar(copropiedadId: string, dispositivoId: string, operadorId: string): Promise<EstadoDeCanal>;
  estado(copropiedadId: string, dispositivoId: string, operadorId: string): Promise<EstadoDeCanal>;
}

export const CANAL_DE_INTERCOM = Symbol.for('ncr.puerto.CanalDeIntercom');

/**
 * Escalamiento de una alerta, declarado por el CONSUMIDOR.
 *
 * `EscalarAlerta` vive en el módulo de eventos y no sale por su barril. En vez
 * de ampliarlo —lo que ataría `guardia` a la clase concreta de otro módulo—, se
 * declara aquí la FORMA que este módulo necesita, y el token lo publica
 * `eventos` (`ESCALAMIENTO_DE_ALERTA`). Es la misma decisión que
 * `ResolutorDeZona` (§2.2): el consumidor declara la forma, no importa la clase.
 */
export interface EscalamientoDeAlerta {
  ejecutar(
    alerta: unknown,
    actorId: string,
  ): Promise<{ readonly destinatarios: number; readonly latenciaMs: number }>;
}
