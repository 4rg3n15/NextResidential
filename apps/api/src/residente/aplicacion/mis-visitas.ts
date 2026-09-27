/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F (15-L) · EL RESIDENTE GENERA SUS VISITAS CON FOTO Y CASILLA
 *
 * El mismo formulario que la consola (F1): nombre y documento, fecha y hora,
 * duración, foto frontal y la casilla. La diferencia es de dónde sale la
 * vivienda —de su vínculo, nunca del cuerpo— y las reglas del residente
 * (`CrearMiAutorizacion`: lista negra, vivienda inactiva, nivel, placa). La
 * segunda mitad —foto, casilla, plantilla, equipos— es EXACTAMENTE la de la
 * consola (`RegistrarRostroDeVisita`), así que no puede divergir.
 *
 * Ya no hay enlace para el visitante ni espera: la casilla es la constancia
 * (ADR-032) y la visita nace vigente (F2).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type {
  ErrorDominio,
  MotivoDeNoAutorizar,
  MotivoRechazoCaptura,
  Resultado,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RevocarAutorizacion } from '../../autorizaciones';
import { hastaDe, revisarForma, revisarFoto } from '../../visitas';
import type {
  AvisoDeVisitas,
  DatosParaVolverAAutorizar,
  FotoDeVisita,
  RegistrarRostroDeVisita,
  RostroRegistrado,
  UltimosVisitantes,
  VisitanteReciente,
} from '../../visitas';
import type { ResolverMiAmbito } from './casos-de-uso';
import type { CrearMiAutorizacion } from './crear-mi-autorizacion';
import type { AutorizacionesDelResidente } from './puertos';

export interface EntradaDeMiVisita {
  readonly nombre: string;
  readonly documento: string;
  readonly inicio: Date;
  readonly duracionMinutos: number;
  readonly placa: string | null;
  readonly observaciones: string | null;
  readonly foto: FotoDeVisita;
  readonly casillaMarcada: boolean;
  readonly claveDeIdempotencia: string;
}

export type ResultadoDeMiVisita =
  | ({
      readonly creada: true;
      readonly id: string;
      readonly repetida: boolean;
    } & Partial<RostroRegistrado>)
  | { readonly creada: false; readonly motivo: MotivoDeNoAutorizar }
  | { readonly creada: false; readonly motivosDeFoto: readonly MotivoRechazoCaptura[] };

export class GenerarMiVisita {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    private readonly crear: CrearMiAutorizacion,
    private readonly autorizaciones: AutorizacionesDelResidente,
    private readonly rostro: RegistrarRostroDeVisita,
    private readonly revocar: RevocarAutorizacion,
    private readonly aviso: AvisoDeVisitas,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDeMiVisita,
  ): Promise<Resultado<ResultadoDeMiVisita, ErrorDominio>> {
    const forma = revisarForma(entrada.casillaMarcada, entrada.duracionMinutos);
    if (esFallo(forma)) return forma;
    const foto = revisarFoto(entrada.foto);
    if (esFallo(foto)) return foto;
    if (!foto.valor.aceptada) return exito({ creada: false, motivosDeFoto: foto.valor.motivos });

    const ambito = await this.resolver.ejecutar(ctx, copropiedadId);
    if (esFallo(ambito)) return ambito;

    const hasta = hastaDe(entrada.inicio, entrada.duracionMinutos);
    const creada = await this.crear.ejecutar(ctx, copropiedadId, {
      visitante: entrada.nombre,
      documento: entrada.documento,
      desde: entrada.inicio.toISOString(),
      hasta: hasta.toISOString(),
      placa: entrada.placa,
      permiteAccesoVehicular: entrada.placa !== null,
      acompanantes: [],
      zonasPermitidas: [],
      observaciones: entrada.observaciones,
      patron: null,
      claveDeIdempotencia: entrada.claveDeIdempotencia,
    });
    if (esFallo(creada)) return creada;
    if (!creada.valor.creada) return exito({ creada: false, motivo: creada.valor.motivo });
    const { id, repetida } = creada.valor;
    // Un reintento sin conexión de una visita que ya llegó: la foto ya viajó
    // con el primer intento y no se duplica (RN-17).
    if (repetida) return exito({ creada: true, id, repetida: true });

    const titular = await this.autorizaciones.titularDeLaAutorizacion(ambito.valor.ambito, id);
    if (titular === null) {
      return fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'La autorización', 'RN-15'));
    }
    const rostro = await this.registrarOAnular(ctx, {
      autorizacionId: id,
      titularId: titular.personaId,
      hasta,
      foto: entrada.foto,
    });
    if (esFallo(rostro)) return rostro;

    await this.aviso.nueva(copropiedadId, id);
    return exito({ creada: true, id, repetida: false, ...rostro.valor });
  }

  /** Igual que en la consola: sin foto registrada, la visita no queda viva. */
  private async registrarOAnular(
    ctx: ContextoTenant,
    entrada: Parameters<RegistrarRostroDeVisita['ejecutar']>[1],
  ): Promise<Resultado<RostroRegistrado, ErrorDominio>> {
    try {
      const r = await this.rostro.ejecutar(ctx, entrada);
      if (esFallo(r)) {
        await this.revocar.ejecutar(
          ctx,
          entrada.autorizacionId,
          `No se registró la foto: ${r.error.detalle}`,
        );
      }
      return r;
    } catch (causa) {
      await this.revocar.ejecutar(ctx, entrada.autorizacionId, 'No se pudo guardar la foto');
      throw causa;
    }
  }
}

export interface EntradaDeRepeticion {
  readonly autorizacionId: string;
  readonly inicio: Date;
  readonly duracionMinutos: number;
  readonly casillaMarcada: boolean;
  readonly claveDeIdempotencia: string;
}

/**
 * F6 · «Volver a autorizar»: copia nombre, documento, placa y la FOTO de una
 * visita anterior de SU vivienda, y sólo pide cuándo y cuánto. La casilla se
 * vuelve a marcar: cada autorización lleva su propia constancia (ADR-032).
 */
export class VolverAAutorizar {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    private readonly datos: DatosParaVolverAAutorizar,
    private readonly generar: GenerarMiVisita,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDeRepeticion,
  ): Promise<Resultado<ResultadoDeMiVisita, ErrorDominio>> {
    const ambito = await this.resolver.ejecutar(ctx, copropiedadId);
    if (esFallo(ambito)) return ambito;
    const anterior = await this.datos.ejecutar(
      copropiedadId,
      ambito.valor.ambito.viviendaId,
      entrada.autorizacionId,
    );
    if (esFallo(anterior)) return anterior;
    const { foto, calidad } = anterior.valor;
    if (foto === null || calidad === null) {
      return fallo(
        errorDominio(
          'DATO_INVALIDO',
          'Esa visita no tiene una foto que se pueda reutilizar: genere una nueva',
        ),
      );
    }
    return this.generar.ejecutar(ctx, copropiedadId, {
      nombre: anterior.valor.visitante,
      documento: anterior.valor.documento,
      inicio: entrada.inicio,
      duracionMinutos: entrada.duracionMinutos,
      placa: anterior.valor.placa,
      observaciones: null,
      foto: { ...foto, calidadPrevia: calidad },
      casillaMarcada: entrada.casillaMarcada,
      claveDeIdempotencia: entrada.claveDeIdempotencia,
    });
  }
}

/** F6 · los últimos visitantes de SU vivienda, uno por persona. */
export class MisUltimosVisitantes {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    private readonly ultimos: UltimosVisitantes,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
  ): Promise<Resultado<readonly VisitanteReciente[], ErrorDominio>> {
    const ambito = await this.resolver.ejecutar(ctx, copropiedadId);
    if (esFallo(ambito)) return ambito;
    return exito(await this.ultimos.ejecutar(copropiedadId, ambito.valor.ambito.viviendaId));
  }
}
