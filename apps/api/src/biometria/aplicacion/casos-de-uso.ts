import { errorDominio, esFallo, exito, fallo, puedeSincronizar } from '@ncr/domain-core';
import type {
  ErrorDominio,
  GeneradorDeId,
  MotivoRechazoCaptura,
  Reloj,
  Resultado,
  UmbralesDeCalidad,
  Vigencia,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { PreparacionDeCaptura } from './preparacion-de-captura';
import type { SolicitudDeCaptura } from './preparacion-de-captura';
import type {
  BovedaDePlantillas,
  RepositorioConsentimientos,
  RepositorioPlantillas,
  VigenciaDeAutorizaciones,
} from './puertos';

const noEncontrado = (que: string): ErrorDominio =>
  errorDominio('ENTIDAD_NO_ENCONTRADA', `${que} no existe en esta copropiedad`, 'RN-15');

/**
 * `CapturarRostro` — CU-02 pasos 1 a 3 · CA-08, HU-13, KPI-16.
 *
 * El orden es la regla: **calidad → consentimiento → plantilla**, y nunca al
 * revés. Pedirle el consentimiento a alguien y descubrir después que la foto no
 * servía obliga a repetir la solicitud, y una solicitud de consentimiento
 * repetida es exactamente lo que erosiona que sea informado y libre.
 *
 * Y una cosa que este caso de uso NO hace: sincronizar. Deja la plantilla en
 * `pendiente_consentimiento` y crea la solicitud. Quien decide si el dato viaja
 * es el titular, en otro momento y por otro canal.
 */
export type ResultadoCaptura =
  | {
      readonly aceptada: true;
      readonly plantillaId: string;
      readonly consentimientoId: string;
      readonly calidad: number;
      /** F4 (15-L) · con la casilla declarada, la plantilla ya puede viajar. */
      readonly lista?: boolean;
    }
  | { readonly aceptada: false; readonly motivos: readonly MotivoRechazoCaptura[] };

/** 15-X · la solicitud vive con la preparación que la usa; aquí se reexporta. */
export type { SolicitudDeCaptura } from './preparacion-de-captura';

export class CapturarRostro {
  /** 15-X · calidad → consentimiento → plantilla, compartido con `MiRostro`. */
  private readonly preparacion: PreparacionDeCaptura;

  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    reloj: Reloj,
    ids: GeneradorDeId,
    umbrales?: UmbralesDeCalidad,
  ) {
    this.preparacion = new PreparacionDeCaptura(consentimientos, reloj, ids, umbrales);
  }

  async ejecutar(
    ctx: ContextoTenant,
    solicitud: SolicitudDeCaptura,
  ): Promise<Resultado<ResultadoCaptura, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const preparada = await this.preparacion.preparar(copropiedadId, solicitud);
    if (esFallo(preparada)) return preparada;
    if (!preparada.valor.aceptada) {
      return exito({ aceptada: false, motivos: preparada.valor.motivos });
    }
    const { consentimiento, plantilla, calidad } = preparada.valor;

    await this.consentimientos.guardar(consentimiento, ctx.usuarioId);
    await this.plantillas.guardar(plantilla, ctx.usuarioId);
    // El vector se cifra al entrar y no vuelve a salir hacia la aplicación.
    await this.boveda.guardar(copropiedadId, plantilla.id, solicitud.vector);

    return exito({
      aceptada: true,
      plantillaId: plantilla.id,
      consentimientoId: consentimiento.id,
      calidad,
      lista: plantilla.estado === 'pendiente_sincronizacion',
    });
  }
}

/** 15-X · D3 · la revocación vive en su fichero, con la del representante legal. */
export { RevocarConsentimiento } from './revocar-consentimiento';
export type { EntradaDeRevocacion, ResultadoDeRevocacion } from './revocar-consentimiento';

/**
 * `SincronizarPlantilla` — RN-09, CA-09.
 *
 * Vuelve a preguntar por el consentimiento **en el instante de sincronizar**,
 * aunque el estado de la plantilla ya diga `pendiente_sincronizacion`. Entre
 * habilitar y empujar pueden pasar minutos, y en esos minutos el titular pudo
 * revocar. Confiar en el estado sería confiar en una foto vieja.
 */
export class SincronizarPlantilla {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: Reloj,
    /**
     * A2 (15-L) · de dónde sale la vigencia que viaja al equipo. Sin él, la
     * plantilla se sincroniza como antes de la 15-L: sin vigencia.
     */
    private readonly vigencias?: VigenciaDeAutorizaciones,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: { readonly plantillaId: string; readonly dispositivoId: string },
  ): Promise<Resultado<{ readonly sincronizada: true }, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const plantilla = await this.plantillas.porId(copropiedadId, entrada.plantillaId);
    if (plantilla === null) return fallo(noEncontrado('La plantilla'));

    const consentimiento = await this.consentimientos.porId(
      copropiedadId,
      plantilla.consentimientoId,
    );
    const ahora = this.reloj.ahora();
    const veredicto = puedeSincronizar(plantilla, consentimiento, ahora);
    if (!veredicto.permitido) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          `No se sincroniza esta plantilla: ${veredicto.motivo}`,
          'RN-09',
        ),
      );
    }

    const vigencia = await this.vigenciaDe(copropiedadId, plantilla.autorizacionId, ahora);
    if (!vigencia.ok) return fallo(vigencia.error);

    try {
      await this.boveda.empujarATerminal(
        copropiedadId,
        plantilla.id,
        entrada.dispositivoId,
        vigencia.valor ?? undefined,
      );
    } catch (causa) {
      // Un lector apagado, fuera de la red o desconocido es un fallo TÉCNICO, y
      // se dice así. Dejarlo escapar producía un 500: el operador leía «error
      // interno» donde el hecho era «la terminal no respondió», y no había
      // forma de distinguirlo de una denegación por consentimiento — que es
      // justo lo que nunca debe confundirse en un sistema de control de acceso.
      //
      // R2 (15-N) · el mensaje se lee en la visita, junto al NOMBRE del equipo:
      // sin su identificador. Y un reloj desviado no es un rechazo del equipo:
      // no se le llegó a enviar nada.
      const detalle = causa instanceof Error ? causa.message : 'fallo del proveedor';
      return fallo(
        errorDominio(
          'CONFLICTO_DE_CONCURRENCIA',
          causa instanceof Error && causa.name === 'RelojDelEquipoDesviado'
            ? `No se le envió: ${detalle}`
            : `El equipo no aceptó la plantilla: ${detalle}`,
          'RN-12',
        ),
      );
    }
    await this.plantillas.registrarSincronizacion(
      { copropiedadId, plantillaId: plantilla.id, dispositivoId: entrada.dispositivoId },
      ctx.usuarioId,
    );
    const marcada = plantilla.marcarSincronizada(ahora);
    if (!esFallo(marcada)) await this.plantillas.guardar(marcada.valor, ctx.usuarioId);

    return exito({ sincronizada: true });
  }

  /**
   * A2 (15-L) · la vigencia de la autorización de la plantilla, para que el
   * equipo caduque el rostro por su cuenta. Sin autorización (o sin quien la
   * consulte), ninguna —como antes—. Con una autorización que no está, está
   * revocada o ya venció, NO se sincroniza: denegar por defecto.
   */
  private async vigenciaDe(
    copropiedadId: string,
    autorizacionId: string | null,
    ahora: Date,
  ): Promise<Resultado<Vigencia | null, ErrorDominio>> {
    if (autorizacionId === null || this.vigencias === undefined) return exito(null);
    const vigencia = await this.vigencias.deLaAutorizacion(copropiedadId, autorizacionId);
    if (vigencia === null) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'No se sincroniza esta plantilla: su autorización no existe o fue revocada',
          'RN-11',
        ),
      );
    }
    if (vigencia.expiradaEn(ahora)) {
      return fallo(
        errorDominio(
          'OPERACION_NO_PERMITIDA',
          'No se sincroniza esta plantilla: su autorización ya venció',
          'RN-01',
        ),
      );
    }
    return exito(vigencia);
  }
}

/**
 * `BarrerPlantillasVencidas` — RN-11, CA-10, KPI-21. Idempotente a propósito:
 * lo va a invocar un trabajo programado que puede reintentar.
 *
 * Hace dos cosas y las cuenta por separado, porque fallan por motivos
 * distintos: suprimir el vector es una escritura en la base, y retirar de la
 * terminal exige que el equipo responda. Un informe que las sumara escondería
 * que las plantillas siguen en un lector caído.
 */
export interface ResultadoBarrido {
  readonly suprimidas: number;
  readonly retiradas: number;
  readonly retiradasFallidas: number;
}

export class BarrerPlantillasVencidas {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(ctx: ContextoTenant): Promise<Resultado<ResultadoBarrido, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const ahora = this.reloj.ahora();
    let suprimidas = 0;
    for (const p of await this.plantillas.vencidas(copropiedadId, ahora)) {
      const r = p.suprimirPorVencimiento(ahora);
      if (esFallo(r)) continue;
      await this.boveda.olvidar(copropiedadId, p.id);
      await this.plantillas.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
      await this.plantillas.guardar(r.valor, ctx.usuarioId);
      suprimidas += 1;
    }
    // F2 (15-L) · la autorización rechazada o revocada se lleva su rostro YA,
    // aunque su plazo no haya llegado (RN-11).
    for (const p of await this.plantillas.deAutorizacionesRevocadas(copropiedadId)) {
      await this.boveda.olvidar(copropiedadId, p.id);
      await this.plantillas.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
      await this.plantillas.guardar(p.suprimirPorRevocacion(ahora), ctx.usuarioId);
      suprimidas += 1;
    }

    let retiradas = 0;
    let retiradasFallidas = 0;
    for (const destino of await this.plantillas.porRetirar(copropiedadId)) {
      try {
        await this.boveda.retirarDeTerminal(destino.plantillaId, destino.dispositivoId);
        await this.plantillas.registrarRetirada(destino, ctx.usuarioId);
        retiradas += 1;
      } catch {
        // La terminal no respondió. La fila sigue en la cola derivada y el
        // próximo barrido lo reintenta: no se marca retirada lo que no se
        // retiró, porque CA-10 se acredita con esa cola vacía.
        retiradasFallidas += 1;
      }
    }

    return exito({ suprimidas, retiradas, retiradasFallidas });
  }
}

export interface ResultadoDeSupresionDeVisita {
  readonly suprimidas: number;
  /** Equipos que confirmaron la retirada en esta llamada. */
  readonly retiradas: number;
  /** Equipos que no respondieron: siguen en la cola y el barrido los reintenta. */
  readonly retiradasPendientes: number;
}

/**
 * `SuprimirRostroDeAutorizacion` — F2 (15-L) · RN-11.
 *
 * Una visita rechazada se lleva SU foto, y sólo la suya: el vector se borra y
 * la plantilla sale de cada equipo que la tenía, en la misma llamada. No es un
 * barrido de la copropiedad —eso lo hace el trabajo programado—: rechazar una
 * visita no debe suprimir de paso las plantillas de otras.
 */
export class SuprimirRostroDeAutorizacion {
  constructor(
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    autorizacionId: string,
  ): Promise<Resultado<ResultadoDeSupresionDeVisita, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const ahora = this.reloj.ahora();
    const suyas = await this.plantillas.deAutorizacion(copropiedadId, autorizacionId);
    let suprimidas = 0;
    for (const p of suyas) {
      if (p.suprimida) continue;
      await this.boveda.olvidar(copropiedadId, p.id);
      await this.plantillas.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
      await this.plantillas.guardar(p.suprimirPorRevocacion(ahora), ctx.usuarioId);
      suprimidas += 1;
    }

    const ids = new Set(suyas.map((p) => p.id));
    let retiradas = 0;
    let retiradasPendientes = 0;
    for (const destino of await this.plantillas.porRetirar(copropiedadId)) {
      if (!ids.has(destino.plantillaId)) continue;
      try {
        await this.boveda.retirarDeTerminal(destino.plantillaId, destino.dispositivoId);
        await this.plantillas.registrarRetirada(destino, ctx.usuarioId);
        retiradas += 1;
      } catch {
        retiradasPendientes += 1;
      }
    }
    return exito({ suprimidas, retiradas, retiradasPendientes });
  }
}
