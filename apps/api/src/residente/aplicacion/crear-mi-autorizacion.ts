/**
 * HU-07 · HU-08 · HU-09 · El residente autoriza a su visitante (M-4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO REUTILIZA `CrearAutorizacion` DEL MÓDULO DE AUTORIZACIONES
 *
 * Existe, hace casi esto, y **no se usa a propósito**. Su firma recibe
 * `viviendaId` y `personaId` desde fuera, que es exactamente la forma que esta
 * superficie existe para prohibir: publicarla en el barril de `autorizaciones`
 * para consumirla desde aquí habría dejado, a un `import` de distancia del
 * módulo del residente, una entrada que acepta la vivienda del vecino. La
 * frontera de §2.2 no es solo «no importes ficheros internos»: es que lo que un
 * módulo publica define lo que otro puede equivocarse en llamar.
 *
 * Lo que sí se comparte es lo que importa que no se duplique: **los objetos de
 * valor del dominio**. `Vigencia` y `PatronRecurrencia` se construyen aquí con
 * las mismas clases, así que la regla de «no nace expirada» (RN-01) y la forma
 * del patrón (RN-22) son literalmente el mismo código en las dos superficies.
 * Lo que difiere es de dónde sale la vivienda, que es justo lo que debe diferir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * EL ORDEN DE LAS COMPROBACIONES, Y POR QUÉ ESTE
 *
 *   1. Ámbito (¿quién es y qué vivienda le toca?)
 *   2. Forma (¿la vigencia y el patrón son construibles?)
 *   3. Reglas de negocio (`puedeAutorizar`: RN-06 > RN-13 > P-11 > RN-04)
 *   4. Escritura
 *
 * La forma va ANTES que las reglas porque un `desde` posterior al `hasta` no es
 * un rechazo de negocio: es una petición mal construida, y decirle al residente
 * «está en lista negra» cuando lo que pasa es que invirtió las fechas sería
 * peor que no decirle nada. Y las reglas van antes que la escritura para que el
 * motivo salga del dominio y no de un código de error de PostgreSQL — salvo la
 * placa, que la base también vigila y devuelve por el mismo nombre.
 */
import { Inject, Injectable } from '@nestjs/common';
import {
  PatronRecurrencia,
  Vigencia,
  aprobacionAutomatica,
  errorDominio,
  estadoPersistible,
  exito,
  fallo,
  puedeAutorizar,
} from '@ncr/domain-core';
import type {
  ErrorDominio,
  MotivoDeNoAutorizar,
  PoliticaDeAprobacion,
  Reloj,
  Resultado,
} from '@ncr/domain-core';
import { RELOJ } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { ResolverMiAmbito } from './casos-de-uso';
import { AUTORIZACIONES_DEL_RESIDENTE } from './puertos';
import type { AutorizacionesDelResidente, NuevaAutorizacion } from './puertos';

/** Lo que la pantalla M-4 envía, ya validado en forma por el DTO. */
export interface EntradaDeNuevaVisita {
  readonly visitante: string;
  readonly documento: string | null;
  readonly desde: string;
  readonly hasta: string;
  readonly placa: string | null;
  readonly permiteAccesoVehicular: boolean;
  readonly acompanantes: readonly string[];
  readonly zonasPermitidas: readonly string[];
  readonly observaciones: string | null;
  readonly patron: NuevaAutorizacion['patron'];
  readonly claveDeIdempotencia: string;
}

/**
 * El rechazo de negocio NO es un `ErrorDominio`.
 *
 * Es un resultado legítimo de la operación y la app tiene que pintarlo con su
 * motivo tipado y su explicación, no como «403, no permitido». Devolverlo como
 * error habría obligado al controlador a adivinar, por el texto del detalle,
 * cuál de los cuatro motivos era — y adivinar por texto es D-79.
 */
export type ResultadoDeNuevaVisita =
  | { readonly creada: true; readonly id: string; readonly repetida: boolean }
  | { readonly creada: false; readonly motivo: MotivoDeNoAutorizar };

@Injectable()
export class CrearMiAutorizacion {
  constructor(
    private readonly resolver: ResolverMiAmbito,
    @Inject(AUTORIZACIONES_DEL_RESIDENTE)
    private readonly autorizaciones: AutorizacionesDelResidente,
    @Inject(RELOJ) private readonly reloj: Reloj,
    /** D5 c · ADR-027: con qué estado nace. Hoy, siempre la automática. */
    private readonly aprobacion: PoliticaDeAprobacion = aprobacionAutomatica,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    copropiedadId: string,
    entrada: EntradaDeNuevaVisita,
  ): Promise<Resultado<ResultadoDeNuevaVisita, ErrorDominio>> {
    const r = await this.resolver.ejecutar(ctx, copropiedadId);
    if (!r.ok) return r;
    const { ambito, vinculo } = r.valor;

    // ── 2 · Forma, con los objetos de valor del dominio ─────────────────────
    const vigencia = Vigencia.crear(new Date(entrada.desde), new Date(entrada.hasta));
    if (!vigencia.ok) return vigencia;
    if (vigencia.valor.expiradaEn(this.reloj.ahora())) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'La vigencia ya está expirada al crearse', 'RN-01'),
      );
    }
    if (entrada.patron !== null) {
      const patron = PatronRecurrencia.crear({
        dias: [...entrada.patron.dias],
        minutoInicio: entrada.patron.minutoInicio,
        minutoFin: entrada.patron.minutoFin,
        desplazamientoUtcMinutos: entrada.patron.desplazamientoUtcMinutos,
      });
      if (!patron.ok) return patron;
    }

    // ── 3 · Reglas de negocio, con su precedencia en el dominio ─────────────
    const deLaBase = await this.autorizaciones.hechosParaAutorizar(ambito, {
      documento: entrada.documento,
      placa: entrada.placa,
    });
    /**
     * El cuarto hecho lo pone el VÍNCULO, no la base: lo que el catálogo de
     * niveles (P-11) dice del nivel de este residente. Un nivel ausente NO
     * autoriza —§2.1.4, denegar por defecto—. H-15I-01: antes se comparaba el
     * NOMBRE del nivel con uno que el catálogo no usa.
     */
    const veredicto = puedeAutorizar({
      ...deLaBase,
      vinculoPuedeAutorizar: vinculo.permiteAutorizar,
    });
    if (!veredicto.puede) return exito({ creada: false, motivo: veredicto.motivo });

    // ── 3 bis · Aprobación (D5 b/c, ADR-027): aprobada al instante, SIN límite
    // de autorizaciones de terceros; la política decide, no un `if` aquí.
    const inicial = this.aprobacion({
      traeVehiculo: entrada.placa !== null,
      recurrente: entrada.patron !== null,
    });
    if (!estadoPersistible(inicial)) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'La aprobación del portero no está construida (ADR-027)',
          'D5 c',
        ),
      );
    }

    // ── 4 · Escritura ──────────────────────────────────────────────────────
    const escrita = await this.autorizaciones.crearAutorizacion(
      ambito,
      { usuarioId: ctx.usuarioId, residenteId: vinculo.residenteId },
      {
        ...entrada,
        acompanantes: [...entrada.acompanantes],
        zonasPermitidas: [...entrada.zonasPermitidas],
      },
    );
    if (!escrita.ok) return exito({ creada: false, motivo: escrita.motivo });
    return exito({ creada: true, id: escrita.id, repetida: escrita.repetida });
  }
}
