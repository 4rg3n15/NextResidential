import { Autorizacion, PatronRecurrencia, Vigencia } from '@ncr/domain-core';
import type { ErrorDominio, GeneradorDeId, Reloj, Resultado } from '@ncr/domain-core';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { alcanzaCopropiedad } from '../../autenticacion';
import type { RepositorioAutorizaciones } from './puertos';

/**
 * Casos de uso de autorizaciones (§2.2, capa de aplicación).
 *
 * Orquestan y **no deciden**: construyen los objetos de valor, piden al
 * agregado que cambie por su método de intención y persisten. Ninguno pregunta
 * «¿puede entrar?» — eso es del motor de reglas, y vive en el dominio.
 *
 * El reloj entra por constructor. Un `new Date()` aquí haría que «la vigencia
 * ya expiró» dependiera del reloj del servidor y no se pudiera probar.
 */
abstract class CasoDeUsoDeAutorizaciones {
  constructor(
    protected readonly repo: RepositorioAutorizaciones,
    protected readonly reloj: Reloj,
  ) {}

  /**
   * §2.7.6 · El aislamiento se comprueba TAMBIÉN aquí, no solo en la RLS: las
   * rutas que usan la llave secreta la omiten por completo.
   */
  protected copropiedadDe(ctx: ContextoTenant): Resultado<string, ErrorDominio> {
    const id = ctx.copropiedadId;
    if (id === null || !alcanzaCopropiedad(ctx, id)) {
      return fallo(
        errorDominio('OPERACION_NO_PERMITIDA', 'La identidad no alcanza esta copropiedad', 'RN-15'),
      );
    }
    return exito(id);
  }
}

export interface EntradaCrearAutorizacion {
  readonly viviendaId: string;
  readonly personaId: string;
  readonly desde: string;
  readonly hasta: string;
  readonly zonasPermitidas?: readonly string[];
  readonly maximoAcompanantes?: number;
  /** Patrón de recurrencia; su presencia es lo único que distingue `CrearRecurrente`. */
  readonly patron?: {
    readonly dias: readonly number[];
    readonly minutoInicio: number;
    readonly minutoFin: number;
    readonly desplazamientoUtcMinutos: number;
  };
}

/**
 * HU-07 · Crea una autorización de visitante. Cubre también la recurrente
 * (HU-09, RN-22): el patrón es un dato de la autorización, no otra clase. Dos
 * casos de uso idénticos salvo un campo opcional habrían duplicado la
 * validación de vigencia, que es donde están los errores.
 */
export class CrearAutorizacion extends CasoDeUsoDeAutorizaciones {
  constructor(
    repo: RepositorioAutorizaciones,
    reloj: Reloj,
    private readonly ids: GeneradorDeId,
  ) {
    super(repo, reloj);
  }

  async ejecutar(
    ctx: ContextoTenant,
    entrada: EntradaCrearAutorizacion,
  ): Promise<Resultado<{ id: string }, ErrorDominio>> {
    const copropiedad = this.copropiedadDe(ctx);
    if (!copropiedad.ok) return copropiedad;

    const vigencia = Vigencia.crear(new Date(entrada.desde), new Date(entrada.hasta));
    if (!vigencia.ok) return vigencia;

    // RN-01 · No se crea una autorización que nace expirada: sería un registro
    // que nunca puede permitir nada y que ensucia el historial del residente.
    if (vigencia.valor.expiradaEn(this.reloj.ahora())) {
      return fallo(errorDominio('DATO_INVALIDO', 'La vigencia ya está expirada', 'RN-01'));
    }

    let patron: PatronRecurrencia | null = null;
    if (entrada.patron !== undefined) {
      const r = PatronRecurrencia.crear(entrada.patron);
      if (!r.ok) return r;
      patron = r.valor;
    }

    const creada = Autorizacion.crear({
      id: this.ids.nuevo(),
      copropiedadId: copropiedad.valor,
      viviendaId: entrada.viviendaId,
      personaId: entrada.personaId,
      vigencia: vigencia.valor,
      zonasPermitidas: entrada.zonasPermitidas ?? [],
      patron,
      ...(entrada.maximoAcompanantes === undefined
        ? {}
        : { maximoAcompanantes: entrada.maximoAcompanantes }),
    });
    if (!creada.ok) return creada;

    await this.repo.guardar(copropiedad.valor, creada.valor, ctx.usuarioId);
    return exito({ id: creada.valor.id });
  }
}

/** HU-08 · Añade un acompañante a una autorización viva (RN-05, D-01). */
export class AgregarAcompanante extends CasoDeUsoDeAutorizaciones {
  async ejecutar(
    ctx: ContextoTenant,
    autorizacionId: string,
    acompanante: { personaId: string; nombre: string },
  ): Promise<Resultado<void, ErrorDominio>> {
    const copropiedad = this.copropiedadDe(ctx);
    if (!copropiedad.ok) return copropiedad;

    const autorizacion = await this.repo.porId(copropiedad.valor, autorizacionId);
    if (autorizacion === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La autorización no existe'));
    }
    const r = autorizacion.agregarAcompanante(acompanante, this.reloj.ahora());
    if (!r.ok) return r;

    await this.repo.guardar(copropiedad.valor, autorizacion, ctx.usuarioId);
    return exito(undefined);
  }
}

/** HU-10 · Revoca. El motivo es obligatorio y lo exige el agregado (RN-19). */
export class RevocarAutorizacion extends CasoDeUsoDeAutorizaciones {
  async ejecutar(
    ctx: ContextoTenant,
    autorizacionId: string,
    motivo: string,
  ): Promise<Resultado<void, ErrorDominio>> {
    const copropiedad = this.copropiedadDe(ctx);
    if (!copropiedad.ok) return copropiedad;

    const autorizacion = await this.repo.porId(copropiedad.valor, autorizacionId);
    if (autorizacion === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La autorización no existe'));
    }
    const r = autorizacion.revocar(motivo, this.reloj.ahora());
    if (!r.ok) return r;

    await this.repo.guardar(copropiedad.valor, autorizacion, ctx.usuarioId);
    return exito(undefined);
  }
}
