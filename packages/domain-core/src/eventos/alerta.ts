import type { Resultado } from '../compartido/resultado';
import { exito, fallo } from '../compartido/resultado';
import type { ErrorDominio } from '../compartido/errores';
import { errorDominio } from '../compartido/errores';

export const TIPOS_DE_ALERTA = [
  'lista_negra',
  'sabotaje',
  'dispositivo_caido',
  'acceso_dudoso',
  'panico',
  'apertura_fallida',
] as const;
export type TipoDeAlerta = (typeof TIPOS_DE_ALERTA)[number];

export const SEVERIDADES = ['informativa', 'media', 'alta', 'critica'] as const;
export type Severidad = (typeof SEVERIDADES)[number];

export const ESTADOS_DE_ALERTA = ['abierta', 'en_atencion', 'resuelta'] as const;
export type EstadoDeAlerta = (typeof ESTADOS_DE_ALERTA)[number];

/**
 * RN-18 · CA-18 · KPI-25 — «menos de 10 segundos» desde que la alerta se genera
 * hasta que llega al operador de central.
 *
 * El plazo vive en el DOMINIO y no en la configuración del canal. Es la
 * diferencia entre un compromiso y una casualidad: si el umbral estuviera en el
 * adaptador de tiempo real, cambiar de transporte cambiaría el compromiso sin
 * que nadie lo notara. Aquí, cualquier transporte que no lo cumpla produce una
 * alerta marcada como fuera de plazo, y eso se ve en el histórico.
 */
export const PLAZO_ESCALAMIENTO_MS = 10_000;

/**
 * Alerta operativa. Cambia por **métodos de intención** y cada uno devuelve una
 * instancia nueva: no hay asignación externa que pueda saltarse una transición
 * (§2.4). Una alerta resuelta no vuelve a `abierta`, y eso lo impone el tipo.
 */
export class Alerta {
  private constructor(
    readonly id: string,
    readonly copropiedadId: string,
    readonly tipo: TipoDeAlerta,
    readonly severidad: Severidad,
    readonly estado: EstadoDeAlerta,
    readonly generadaEn: Date,
    readonly eventoId: string | null,
    readonly dispositivoId: string | null,
    readonly escaladaEn: Date | null,
    readonly atendidaPor: string | null,
    readonly atendidaEn: Date | null,
    readonly resueltaEn: Date | null,
    readonly notas: string | null,
  ) {
    Object.freeze(this);
  }

  static abrir(datos: {
    id: string;
    copropiedadId: string;
    tipo: TipoDeAlerta;
    severidad: Severidad;
    generadaEn: Date;
    eventoId?: string | null;
    dispositivoId?: string | null;
    notas?: string | null;
  }): Resultado<Alerta, ErrorDominio> {
    // La restricción `alertas_origen` de la migración 0011 exige un origen; se
    // comprueba aquí también para que el fallo aparezca en el caso de uso y no
    // como un error de base a mitad de una transacción.
    if (!datos.eventoId && !datos.dispositivoId) {
      return fallo(
        errorDominio('INVARIANTE_VIOLADA', 'Una alerta nace de un evento o de un dispositivo'),
      );
    }
    if (datos.copropiedadId.length === 0) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'Toda alerta pertenece a una copropiedad', 'RN-15'),
      );
    }
    return exito(
      new Alerta(
        datos.id,
        datos.copropiedadId,
        datos.tipo,
        datos.severidad,
        'abierta',
        new Date(datos.generadaEn.getTime()),
        datos.eventoId ?? null,
        datos.dispositivoId ?? null,
        null,
        null,
        null,
        null,
        datos.notas ?? null,
      ),
    );
  }

  /** Sella el instante en que la alerta llegó al operador de central (KPI-25). */
  escalar(ahora: Date): Alerta {
    if (this.escaladaEn !== null) return this;
    return this.copiar({ escaladaEn: new Date(ahora.getTime()) });
  }

  atender(operadorId: string, ahora: Date): Resultado<Alerta, ErrorDominio> {
    if (this.estado === 'resuelta') {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'Una alerta resuelta no vuelve a atenderse'),
      );
    }
    return exito(
      this.copiar({
        estado: 'en_atencion',
        atendidaPor: operadorId,
        atendidaEn: new Date(ahora.getTime()),
      }),
    );
  }

  resolver(ahora: Date, notas: string): Resultado<Alerta, ErrorDominio> {
    if (notas.trim().length === 0) {
      return fallo(
        errorDominio('INVARIANTE_VIOLADA', 'Cerrar una alerta exige dejar constancia del motivo'),
      );
    }
    return exito(this.copiar({ estado: 'resuelta', resueltaEn: new Date(ahora.getTime()), notas }));
  }

  /**
   * KPI-25 en el propio agregado: `null` mientras no se haya escalado, y
   * `false` si se escaló tarde. Devolver `true` para lo no escalado convertiría
   * el indicador en una mentira cómoda.
   */
  escaladaDentroDelPlazo(): boolean | null {
    if (this.escaladaEn === null) return null;
    return this.escaladaEn.getTime() - this.generadaEn.getTime() <= PLAZO_ESCALAMIENTO_MS;
  }

  private copiar(cambios: Partial<Record<string, unknown>>): Alerta {
    const c = cambios as {
      estado?: EstadoDeAlerta;
      escaladaEn?: Date | null;
      atendidaPor?: string | null;
      atendidaEn?: Date | null;
      resueltaEn?: Date | null;
      notas?: string | null;
    };
    return new Alerta(
      this.id,
      this.copropiedadId,
      this.tipo,
      this.severidad,
      c.estado ?? this.estado,
      this.generadaEn,
      this.eventoId,
      this.dispositivoId,
      c.escaladaEn === undefined ? this.escaladaEn : c.escaladaEn,
      c.atendidaPor === undefined ? this.atendidaPor : c.atendidaPor,
      c.atendidaEn === undefined ? this.atendidaEn : c.atendidaEn,
      c.resueltaEn === undefined ? this.resueltaEn : c.resueltaEn,
      c.notas === undefined ? this.notas : c.notas,
    );
  }
}
