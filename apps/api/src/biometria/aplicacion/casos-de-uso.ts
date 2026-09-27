import {
  CalidadDeCaptura,
  ConsentimientoBiometrico,
  PlantillaBiometrica,
  errorDominio,
  esFallo,
  evaluarCaptura,
  exito,
  fallo,
  puedeSincronizar,
} from '@ncr/domain-core';
import type {
  CanalConsentimiento,
  ErrorDominio,
  EvaluacionDeCaptura,
  GeneradorDeId,
  MedidasDeCaptura,
  MotivoRechazoCaptura,
  Reloj,
  Resultado,
  UmbralesDeCalidad,
  Vigencia,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
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

export interface SolicitudDeCaptura {
  readonly titularId: string;
  readonly autorizacionId?: string;
  /** Las medidas de ESTA captura. Obligatorias salvo con `calidadPrevia`. */
  readonly medidas?: MedidasDeCaptura;
  /**
   * F6 (15-L) · «Volver a autorizar» reutiliza una foto que YA se evaluó: su
   * calidad es la que se midió entonces y quedó en la plantilla original. No
   * se inventan medidas nuevas para una foto que nadie volvió a tomar.
   */
  readonly calidadPrevia?: number;
  readonly vector: Uint8Array;
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  readonly suprimirEn: Date;
  /**
   * F4 (15-L, ADR-032) · la casilla del formulario: quien registra declara que
   * el visitante autorizó el uso de su foto. Con ella el consentimiento nace
   * vigente —o se reutiliza el que el titular ya tenga vigente— y la plantilla
   * queda lista para sincronizar. Sin ella, el camino de siempre: solicitud
   * pendiente del titular.
   */
  readonly declaracion?: { readonly declaradoPor: string };
}

export class CapturarRostro {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeId,
    private readonly umbrales?: UmbralesDeCalidad,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    solicitud: SolicitudDeCaptura,
  ): Promise<Resultado<ResultadoCaptura, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const evaluacion = this.evaluar(solicitud);
    if (esFallo(evaluacion)) return evaluacion;
    if (!evaluacion.valor.aceptada) {
      return exito({ aceptada: false, motivos: evaluacion.valor.motivos });
    }

    const ahora = this.reloj.ahora();
    const consentimiento = await this.consentimientoPara(copropiedadId, solicitud, ahora);
    if (esFallo(consentimiento)) return consentimiento;

    const creada = PlantillaBiometrica.crear({
      id: this.ids.nuevo(),
      copropiedadId,
      titularId: solicitud.titularId,
      consentimientoId: consentimiento.valor.id,
      ...(solicitud.autorizacionId === undefined
        ? {}
        : { autorizacionId: solicitud.autorizacionId }),
      calidad: evaluacion.valor.calidad,
      creadoEn: ahora,
      suprimirEn: solicitud.suprimirEn,
    });
    if (esFallo(creada)) return creada;
    // Con el consentimiento ya vigente (declarado o previo), la plantilla nace
    // habilitada: el agregado comprueba que sea de este titular y vigente.
    const plantilla = consentimiento.valor.vigente
      ? creada.valor.habilitarSincronizacion(consentimiento.valor)
      : creada;
    if (esFallo(plantilla)) return plantilla;

    await this.consentimientos.guardar(consentimiento.valor, ctx.usuarioId);
    await this.plantillas.guardar(plantilla.valor, ctx.usuarioId);
    // El vector se cifra al entrar y no vuelve a salir hacia la aplicación.
    await this.boveda.guardar(copropiedadId, plantilla.valor.id, solicitud.vector);

    return exito({
      aceptada: true,
      plantillaId: plantilla.valor.id,
      consentimientoId: consentimiento.valor.id,
      calidad: evaluacion.valor.calidad.valor,
      lista: plantilla.valor.estado === 'pendiente_sincronizacion',
    });
  }

  /** Las medidas de esta captura, o la calidad ya medida de la foto que se reutiliza. */
  private evaluar(solicitud: SolicitudDeCaptura): Resultado<EvaluacionDeCaptura, ErrorDominio> {
    if (solicitud.calidadPrevia !== undefined) {
      const calidad = CalidadDeCaptura.crear(solicitud.calidadPrevia);
      if (esFallo(calidad)) return calidad;
      return exito({ aceptada: true, calidad: calidad.valor });
    }
    if (solicitud.medidas === undefined) {
      return fallo(
        errorDominio('DATO_INVALIDO', 'Faltan las medidas de calidad de la foto', 'KPI-16'),
      );
    }
    return exito(
      this.umbrales === undefined
        ? evaluarCaptura(solicitud.medidas)
        : evaluarCaptura(solicitud.medidas, this.umbrales),
    );
  }

  /**
   * Sin casilla: una solicitud nueva, pendiente del titular. Con casilla
   * (F4): el consentimiento vigente del titular si ya lo tiene —la base admite
   * uno solo vigente por persona— y, si no, uno DECLARADO por quien registra.
   */
  private async consentimientoPara(
    copropiedadId: string,
    solicitud: SolicitudDeCaptura,
    ahora: Date,
  ): Promise<Resultado<ConsentimientoBiometrico, ErrorDominio>> {
    const base = {
      id: this.ids.nuevo(),
      copropiedadId,
      titularId: solicitud.titularId,
      finalidad: 'control_acceso',
      versionPolitica: solicitud.versionPolitica,
      canal: solicitud.canal,
    };
    if (solicitud.declaracion === undefined) {
      return ConsentimientoBiometrico.solicitar({ ...base, solicitadoEn: ahora });
    }
    const vigente = await this.consentimientos.vigenteDe(copropiedadId, solicitud.titularId);
    if (vigente !== null) return exito(vigente);
    return ConsentimientoBiometrico.declarar({
      ...base,
      declaradoPor: solicitud.declaracion.declaradoPor,
      ahora,
    });
  }
}

/**
 * `ResponderConsentimiento` — CU-02 pasos 4 y 5 · RN-10, CA-09.
 *
 * `quienResponde` viene del token del titular, no de un campo del cuerpo: si lo
 * pusiera el cliente, RN-10 sería una casilla que cualquiera puede marcar.
 */
export class ResponderConsentimiento {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly plantillas: RepositorioPlantillas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: {
      readonly consentimientoId: string;
      readonly quienResponde: string;
      readonly acepta: boolean;
      readonly evidenciaId?: string;
    },
  ): Promise<Resultado<{ readonly estado: string }, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const actual = await this.consentimientos.porId(copropiedadId, entrada.consentimientoId);
    if (actual === null) return fallo(noEncontrado('El consentimiento'));

    const ahora = this.reloj.ahora();
    const respondido = entrada.acepta
      ? actual.otorgar(entrada.quienResponde, ahora, entrada.evidenciaId)
      : actual.rechazar(entrada.quienResponde, ahora);
    if (esFallo(respondido)) return respondido;

    await this.consentimientos.guardar(respondido.valor, ctx.usuarioId);

    // Aceptar habilita; rechazar deja la plantilla donde está y el barrido la
    // suprimirá a su plazo. No se borra aquí: el rechazo no es una revocación,
    // y el flujo alterno de CU-02 permite que la autorización siga viva solo
    // por placa.
    if (entrada.acepta) {
      for (const p of await this.plantillas.deConsentimiento(copropiedadId, actual.id)) {
        const habilitada = p.habilitarSincronizacion(respondido.valor);
        if (esFallo(habilitada)) continue;
        await this.plantillas.guardar(habilitada.valor, ctx.usuarioId);
      }
    }

    return exito({ estado: respondido.valor.estado });
  }
}

/**
 * `RevocarConsentimiento` — RN-11, CA-11.
 *
 * Suprime **antes** de guardar la revocación, y el orden importa: si se
 * guardara primero y el borrado fallara, quedaría un consentimiento revocado
 * con el dato todavía en la base. Al revés, un fallo deja el consentimiento
 * vigente y el dato borrado — que es el error que se puede vivir.
 *
 * A3 (15-E) · **y retira de las terminales en el acto**. CA-11 dice «de
 * inmediato», y hasta aquí «inmediato» era el vector en la base: la retirada
 * del equipo esperaba al barrido. Ahora se intenta aquí mismo, terminal por
 * terminal; la que no responda queda en la cola derivada de CA-10 y el
 * barrido la reintenta. Se devuelven las dos cuentas por separado, porque
 * «suprimida en base» y «retirada del equipo» son hechos distintos y la hoja
 * de resultados en sitio los coteja por separado.
 */
export interface ResultadoDeRevocacion {
  readonly plantillasSuprimidas: number;
  /** Retiradas de terminal confirmadas por el proveedor en esta llamada. */
  readonly retiradas: number;
  /** Terminales que no respondieron: siguen en la cola de CA-10. */
  readonly retiradasPendientes: number;
}

export class RevocarConsentimiento {
  constructor(
    private readonly consentimientos: RepositorioConsentimientos,
    private readonly plantillas: RepositorioPlantillas,
    private readonly boveda: BovedaDePlantillas,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(
    ctx: ContextoTenant,
    entrada: { readonly consentimientoId: string; readonly quienRevoca: string },
  ): Promise<Resultado<ResultadoDeRevocacion, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const actual = await this.consentimientos.porId(copropiedadId, entrada.consentimientoId);
    if (actual === null) return fallo(noEncontrado('El consentimiento'));

    const ahora = this.reloj.ahora();
    const revocado = actual.revocar(entrada.quienRevoca, ahora);
    if (esFallo(revocado)) return revocado;

    const afectadas = await this.plantillas.deConsentimiento(copropiedadId, actual.id);
    const suprimidasAhora = new Set<string>();
    for (const p of afectadas) {
      if (p.suprimida) continue;
      await this.boveda.olvidar(copropiedadId, p.id);
      await this.plantillas.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
      await this.plantillas.guardar(p.suprimirPorRevocacion(ahora), ctx.usuarioId);
      suprimidasAhora.add(p.id);
    }

    await this.consentimientos.guardar(revocado.valor, ctx.usuarioId);

    // La retirada inmediata: sólo de las plantillas de ESTE consentimiento.
    let retiradas = 0;
    let retiradasPendientes = 0;
    const propias = new Set(afectadas.map((p) => p.id));
    for (const destino of await this.plantillas.porRetirar(copropiedadId)) {
      if (!propias.has(destino.plantillaId)) continue;
      try {
        await this.boveda.retirarDeTerminal(destino.plantillaId, destino.dispositivoId);
        await this.plantillas.registrarRetirada(destino, ctx.usuarioId);
        retiradas += 1;
      } catch {
        // La terminal no respondió: la fila sigue en la cola y el barrido
        // lo reintenta. No se marca retirada lo que no se retiró.
        retiradasPendientes += 1;
      }
    }

    return exito({ plantillasSuprimidas: suprimidasAhora.size, retiradas, retiradasPendientes });
  }
}

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
      return fallo(
        errorDominio(
          'CONFLICTO_DE_CONCURRENCIA',
          `La terminal ${entrada.dispositivoId} no aceptó la plantilla: ${
            causa instanceof Error ? causa.message : 'fallo del proveedor'
          }`,
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
