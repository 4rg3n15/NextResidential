import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type {
  ErrorDominio,
  GeneradorDeId,
  Reloj,
  ResultadoDeAccionamiento,
  Resultado,
} from '@ncr/domain-core';
import type { ContextoTenant, Rol } from '../../autenticacion';
import { alcanzaCopropiedad } from '../../autenticacion';

/**
 * Apertura y negación MANUAL desde portería y guardia virtual.
 *
 * RN-08 · CA-16 · CA-17 · HU-22 · HU-27
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL MOTIVO ES OBLIGATORIO, Y ESO SIGNIFICA QUE SIN MOTIVO **NO SE ABRE**
 *
 * No que se abra y se anote «sin motivo». No que el campo sea obligatorio en el
 * formulario. La orden **no se ejecuta**: la comprobación está aquí, delante de
 * la llamada al proveedor, y el caso de uso devuelve un fallo tipado. Es la
 * diferencia entre una puerta con trazabilidad y una puerta con un campo de
 * texto al lado.
 *
 * El motivo se **normaliza y se acota** antes de nada (§2.7.4): recorte,
 * longitud máxima y rechazo de lo que sólo son espacios. Un motivo de un
 * carácter o de tres mil no es un motivo; es un formulario rellenado para pasar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIEMPRE HAY EVENTO, ABRA O NIEGUE
 *
 * RN-02: todo intento genera evento. Una negación manual es exactamente el
 * hecho que un incidente necesita reconstruir —quién dijo que no, cuándo y por
 * qué—, y es el que más fácilmente se queda sin registrar porque «no pasó nada».
 */

export const LONGITUD_MINIMA_DE_MOTIVO = 8;
export const LONGITUD_MAXIMA_DE_MOTIVO = 300;

/** Quién puede accionar una puerta a mano. El residente nunca. */
export const ROLES_QUE_ACCIONAN: readonly Rol[] = [
  'portero',
  'operador_central',
  'administrador',
  'superadministrador',
];

export type AccionManual = 'abrir' | 'negar';

export interface OrdenManual {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly accion: AccionManual;
  readonly motivo: string;
  /** Evento que se está atendiendo, si la orden responde a uno. */
  readonly eventoId?: string | null;
}

/**
 * Cómo respondió el equipo, en tres estados y ninguno «abierta».
 *
 * `null` mientras la orden no se ha ejecutado —y siempre, en una negación, que
 * no acciona nada—. El detalle de por qué son tres y por qué falta el cuarto
 * está en el puerto `ControlDeBarrera` del dominio: H-1 y H-2 de la validación
 * en sitio. Aquí basta con no perderlos por el camino, porque **un portero
 * delante de la barrera necesita distinguir un rechazo de un equipo mudo**: uno
 * se arregla desbloqueando el acceso, el otro llamando al técnico.
 */
export type EstadoDeAccionamiento = ResultadoDeAccionamiento['estado'];

export interface OrdenEjecutada {
  readonly id: string;
  /** La frontera del tenant viaja con la orden: la bitácora la indexa por ella. */
  readonly copropiedadId: string;
  readonly accion: AccionManual;
  readonly motivo: string;
  readonly operadorId: string;
  readonly rol: Rol;
  readonly dispositivoId: string;
  readonly momento: Date;
  readonly eventoId: string | null;
  readonly resultado?: EstadoDeAccionamiento | null;
  /** Lo que contestó el equipo, ya en lenguaje del operador. */
  readonly detalle?: string | null;
}

/**
 * Puerto de accionamiento. Lo declara el consumidor: al caso de uso no le
 * importa si detrás hay un relé del fabricante o el simulado de esta etapa.
 *
 * **Devolvía `void` y ya no puede.** Con un relé real hay tres desenlaces que
 * el operador necesita ver separados —aceptada, rechazada, inalcanzable— y
 * `void` los aplasta en uno. El tipo del resultado vive en el dominio para que
 * el adaptador de `packages/providers` lo comprometa con `implements`; si
 * viviera solo aquí, el paquete no podría importarlo y la compatibilidad sería
 * una coincidencia en vez de una comprobación.
 */
export interface AccionadorDePuerta {
  accionar(dispositivoId: string, abrir: boolean): Promise<ResultadoDeAccionamiento>;
}
export const ACCIONADOR_DE_PUERTA = Symbol.for('ncr.puerto.AccionadorDePuerta');

/**
 * Puerto del BLOQUEO, separado del anterior a propósito (H-3).
 *
 * Accionar es un pulso sobre un paso concreto; bloquear es **estado que queda**
 * y que manda sobre toda decisión posterior: con el acceso bloqueado, una placa
 * autorizada no abre. Son operaciones distintas en consecuencias y en quién
 * puede ejecutarlas, y un solo método las haría parecer intercambiables.
 */
export interface BloqueoDeAcceso {
  fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento>;
}
export const BLOQUEO_DE_ACCESO = Symbol.for('ncr.puerto.BloqueoDeAcceso');

export interface BitacoraDeOrdenes {
  registrar(orden: OrdenEjecutada): Promise<void>;
  /**
   * Anota cómo acabó una orden ya registrada. Es una segunda escritura, y por
   * eso existe: el rastro se guarda ANTES de accionar y no puede esperar a
   * saber el desenlace. Si esta falla, el rastro sigue estando.
   */
  anotarResultado(
    id: string,
    resultado: EstadoDeAccionamiento,
    detalle: string | null,
  ): Promise<void>;
  ultimas(copropiedadId: string, cuantas: number): Promise<readonly OrdenEjecutada[]>;
}
export const BITACORA_DE_ORDENES = Symbol.for('ncr.puerto.BitacoraDeOrdenes');

/**
 * Normaliza el motivo y dice por qué no vale, si no vale. Puro: es la regla, y
 * la comparte la consola para no ofrecer un botón que el servidor rechazará.
 */
export const motivoValido = (crudo: unknown): Resultado<string, ErrorDominio> => {
  if (typeof crudo !== 'string') {
    return fallo(errorDominio('DATO_INVALIDO', 'El motivo es obligatorio', 'RN-08'));
  }
  // Normalización Unicode y colapso de espacios antes de medir: «        » no
  // es un motivo de ocho caracteres.
  const limpio = crudo.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (limpio.length < LONGITUD_MINIMA_DE_MOTIVO) {
    return fallo(
      errorDominio(
        'DATO_INVALIDO',
        `El motivo debe tener al menos ${String(LONGITUD_MINIMA_DE_MOTIVO)} caracteres: sin motivo no se acciona la puerta`,
        'RN-08',
      ),
    );
  }
  if (limpio.length > LONGITUD_MAXIMA_DE_MOTIVO) {
    return fallo(
      errorDominio(
        'DATO_INVALIDO',
        `El motivo no puede pasar de ${String(LONGITUD_MAXIMA_DE_MOTIVO)} caracteres`,
        'RN-08',
      ),
    );
  }
  return exito(limpio);
};

export class AccionarPuertaAMano {
  constructor(
    private readonly accionador: AccionadorDePuerta,
    private readonly bitacora: BitacoraDeOrdenes,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeId,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    orden: OrdenManual,
  ): Promise<Resultado<OrdenEjecutada, ErrorDominio>> {
    if (!ROLES_QUE_ACCIONAN.includes(ctx.rol)) {
      return fallo(errorDominio('OPERACION_NO_PERMITIDA', 'Tu rol no acciona puertas', 'RN-08'));
    }
    if (!alcanzaCopropiedad(ctx, orden.copropiedadId)) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no alcanza esta copropiedad', 'RN-15'),
      );
    }

    // ANTES de accionar. Si esto se moviera después, la puerta se abriría y el
    // registro fallaría: exactamente la apertura sin rastro que RN-08 prohíbe.
    const motivo = motivoValido(orden.motivo);
    if (!motivo.ok) return motivo;

    const ejecutada: OrdenEjecutada = {
      id: this.ids.nuevo(),
      copropiedadId: orden.copropiedadId,
      accion: orden.accion,
      motivo: motivo.valor,
      operadorId: ctx.usuarioId,
      rol: ctx.rol,
      dispositivoId: orden.dispositivoId,
      momento: this.reloj.ahora(),
      eventoId: orden.eventoId ?? null,
    };

    /**
     * El rastro se escribe ANTES de tocar el relé, y a propósito.
     *
     * Si el orden fuera el contrario, una caída entre accionar y registrar
     * dejaría una puerta abierta sin constancia — el peor de los dos estados
     * posibles. Al revés, lo peor es una orden registrada que no llegó a
     * abrir: el operador lo ve, insiste, y el incidente queda documentado.
     */
    await this.bitacora.registrar(ejecutada);
    if (orden.accion !== 'abrir') return exito(ejecutada);

    const resultado = await this.accionador.accionar(orden.dispositivoId, true);
    const detalle = resultado.estado === 'aceptada' ? null : resultado.motivo;
    await this.bitacora.anotarResultado(ejecutada.id, resultado.estado, detalle);

    /**
     * Se devuelve el desenlace, **y «aceptada» no dice que la barrera se abrió**
     * (H-1, H-2). La consola muestra lo que el equipo contestó, que es lo único
     * que el sistema sabe mientras no haya señal de posición cableada.
     */
    return exito({ ...ejecutada, resultado: resultado.estado, detalle });
  }
}
