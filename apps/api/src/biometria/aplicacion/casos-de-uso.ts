import {
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
  GeneradorDeId,
  MedidasDeCaptura,
  MotivoRechazoCaptura,
  Reloj,
  Resultado,
  UmbralesDeCalidad,
} from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type {
  BovedaDePlantillas,
  RepositorioConsentimientos,
  RepositorioPlantillas,
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
    }
  | { readonly aceptada: false; readonly motivos: readonly MotivoRechazoCaptura[] };

export interface SolicitudDeCaptura {
  readonly titularId: string;
  readonly autorizacionId?: string;
  readonly medidas: MedidasDeCaptura;
  readonly vector: Uint8Array;
  readonly versionPolitica: string;
  readonly canal: CanalConsentimiento;
  readonly suprimirEn: Date;
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

    const evaluacion =
      this.umbrales === undefined
        ? evaluarCaptura(solicitud.medidas)
        : evaluarCaptura(solicitud.medidas, this.umbrales);
    if (!evaluacion.aceptada) {
      return exito({ aceptada: false, motivos: evaluacion.motivos });
    }

    const ahora = this.reloj.ahora();
    const consentimiento = ConsentimientoBiometrico.solicitar({
      id: this.ids.nuevo(),
      copropiedadId,
      titularId: solicitud.titularId,
      finalidad: 'control_acceso',
      versionPolitica: solicitud.versionPolitica,
      canal: solicitud.canal,
      solicitadoEn: ahora,
    });
    if (esFallo(consentimiento)) return consentimiento;

    const plantilla = PlantillaBiometrica.crear({
      id: this.ids.nuevo(),
      copropiedadId,
      titularId: solicitud.titularId,
      consentimientoId: consentimiento.valor.id,
      ...(solicitud.autorizacionId === undefined
        ? {}
        : { autorizacionId: solicitud.autorizacionId }),
      calidad: evaluacion.calidad,
      creadoEn: ahora,
      suprimirEn: solicitud.suprimirEn,
    });
    if (esFallo(plantilla)) return plantilla;

    await this.consentimientos.guardar(consentimiento.valor, ctx.usuarioId);
    await this.plantillas.guardar(plantilla.valor, ctx.usuarioId);
    // El vector se cifra al entrar y no vuelve a salir hacia la aplicación.
    await this.boveda.guardar(copropiedadId, plantilla.valor.id, solicitud.vector);

    return exito({
      aceptada: true,
      plantillaId: plantilla.valor.id,
      consentimientoId: consentimiento.valor.id,
      calidad: evaluacion.calidad.valor,
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
 */
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
  ): Promise<Resultado<{ readonly plantillasSuprimidas: number }, ErrorDominio>> {
    const copropiedadId = ctx.copropiedadId;
    if (copropiedadId === null) return fallo(noEncontrado('La copropiedad'));

    const actual = await this.consentimientos.porId(copropiedadId, entrada.consentimientoId);
    if (actual === null) return fallo(noEncontrado('El consentimiento'));

    const ahora = this.reloj.ahora();
    const revocado = actual.revocar(entrada.quienRevoca, ahora);
    if (esFallo(revocado)) return revocado;

    const afectadas = await this.plantillas.deConsentimiento(copropiedadId, actual.id);
    let suprimidas = 0;
    for (const p of afectadas) {
      if (p.suprimida) continue;
      await this.boveda.olvidar(copropiedadId, p.id);
      await this.plantillas.suprimirVector(copropiedadId, p.id, ctx.usuarioId);
      await this.plantillas.guardar(p.suprimirPorRevocacion(ahora), ctx.usuarioId);
      suprimidas += 1;
    }

    await this.consentimientos.guardar(revocado.valor, ctx.usuarioId);
    return exito({ plantillasSuprimidas: suprimidas });
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

    try {
      await this.boveda.empujarATerminal(copropiedadId, plantilla.id, entrada.dispositivoId);
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
      { plantillaId: plantilla.id, dispositivoId: entrada.dispositivoId },
      ctx.usuarioId,
    );
    const marcada = plantilla.marcarSincronizada(ahora);
    if (!esFallo(marcada)) await this.plantillas.guardar(marcada.valor, ctx.usuarioId);

    return exito({ sincronizada: true });
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
