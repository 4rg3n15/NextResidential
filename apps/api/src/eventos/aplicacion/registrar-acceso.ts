import {
  Acceso,
  Alerta,
  clasificarAcceso,
  construirClaveIdempotencia,
  errorDominio,
  esFallo,
  exito,
  fallo,
} from '@ncr/domain-core';
import type {
  Bitacora,
  ErrorDominio,
  GeneradorDeId,
  Reloj,
  Resultado,
  ResultadoAcceso,
  TipoDeEvento,
} from '@ncr/domain-core';
import type {
  CanalTiempoReal,
  MotorDeDecision,
  NotificadorPush,
  RepositorioAlertas,
  RepositorioEventos,
} from './puertos';
import { TEMA_EVENTOS } from './puertos';
import type { EscalarAlerta } from './escalamiento';

export interface HechoEntrante {
  readonly copropiedadId: string;
  readonly dispositivoId: string;
  readonly metodo: 'placa' | 'facial' | 'manual' | 'remoto' | 'tarjeta';
  readonly referenciaExterna: string;
  readonly confianza: number;
  readonly personaId?: string | null;
  readonly viviendaId?: string | null;
  readonly placaLeida?: string | null;
  readonly zonaId?: string | null;
  readonly evidenciaId?: string | null;
  readonly operadorId?: string | null;
  readonly motivoManual?: string | null;
  readonly decididoPorEdge?: boolean;
  readonly cachePotencialmenteObsoleto?: boolean;
}

export interface ConstanciaDeAcceso {
  readonly eventoId: string;
  readonly claveIdempotencia: string;
  readonly duplicado: boolean;
  readonly permitido: boolean;
  readonly alertaId: string | null;
}

/**
 * Caso de uso `RegistrarAcceso` — OE-05, RN-02, RN-03, RN-17, CA-22, CA-23.
 *
 * Cierra D-27: hasta la ETAPA 05 la ingesta acreditaba la firma y devolvía la
 * clave de idempotencia sin decidir ni persistir nada. Aquí el hecho recorre el
 * camino entero — clave, decisión, evento, alerta, escalamiento, aviso — y **no
 * hay ninguna rama que abra una puerta sin dejar evento** (RN-02).
 *
 * El orden importa y es deliberado: el evento se anexa **antes** de publicar
 * nada. Si se publicara primero, un fallo de persistencia dejaría a las
 * consolas mostrando un acceso que no existe en el histórico, y el histórico es
 * la única fuente que la auditoría acepta. Publicar de más es un aviso perdido;
 * publicar de menos, un evento inventado.
 */
export class RegistrarAcceso {
  constructor(
    private readonly motor: MotorDeDecision,
    private readonly eventos: RepositorioEventos,
    private readonly alertas: RepositorioAlertas,
    private readonly canal: CanalTiempoReal,
    private readonly escalador: EscalarAlerta,
    private readonly reloj: Reloj,
    private readonly ids: GeneradorDeId,
    private readonly bitacora: Bitacora,
    private readonly push?: NotificadorPush,
  ) {}

  async ejecutar(
    hecho: HechoEntrante,
    actorId: string,
  ): Promise<Resultado<ConstanciaDeAcceso, ErrorDominio>> {
    const clave = construirClaveIdempotencia({
      copropiedadId: hecho.copropiedadId,
      dispositivoId: hecho.dispositivoId,
      origen: hecho.metodo,
      referenciaExterna: hecho.referenciaExterna,
    });
    if (esFallo(clave)) return clave;

    const decision = await this.motor.decidir({
      copropiedadId: hecho.copropiedadId,
      dispositivoId: hecho.dispositivoId,
      metodo: hecho.metodo,
      personaId: hecho.personaId ?? null,
      placaLeida: hecho.placaLeida ?? null,
      zonaId: hecho.zonaId ?? null,
      confianza: hecho.confianza,
    });

    const construido = Acceso.desdeDecision(
      {
        id: this.ids.nuevo(),
        copropiedadId: hecho.copropiedadId,
        ocurridoEn: this.reloj.ahora(),
        tipo: tipoDeEvento(hecho, decision),
        metodo: hecho.metodo,
        dispositivoId: hecho.dispositivoId,
        claveIdempotencia: clave.valor,
        personaId: hecho.personaId ?? null,
        viviendaId: hecho.viviendaId ?? null,
        zonaId: hecho.zonaId ?? null,
        placaDetectada: hecho.placaLeida ?? null,
        confianza: hecho.confianza,
        evidenciaId: hecho.evidenciaId ?? null,
        operadorId: hecho.operadorId ?? null,
        motivoManual: hecho.motivoManual ?? null,
        decididoPorEdge: hecho.decididoPorEdge ?? false,
        cachePotencialmenteObsoleto: hecho.cachePotencialmenteObsoleto ?? false,
      },
      decision,
    );
    if (esFallo(construido)) return construido;
    const acceso = construido.valor;

    const anexado = await this.eventos.anexar(acceso, actorId);
    if (anexado.tipo === 'duplicado') {
      // CA-22 · descarte SILENCIOSO. No es un error del emisor: el Edge
      // reintenta a propósito, y un 409 le haría reintentar otra vez.
      this.bitacora.registrar('info', 'evento duplicado descartado (RN-17)', {
        copropiedadId: hecho.copropiedadId,
        claveIdempotencia: clave.valor,
      });
      return exito({
        eventoId: anexado.id,
        claveIdempotencia: clave.valor,
        duplicado: true,
        permitido: acceso.permitido,
        alertaId: null,
      });
    }

    await this.difundir(acceso);
    const alertaId = await this.alertar(acceso, actorId);
    await this.avisarAlResidente(acceso);

    return exito({
      eventoId: acceso.id,
      claveIdempotencia: clave.valor,
      duplicado: false,
      permitido: acceso.permitido,
      alertaId,
    });
  }

  /** Publica en el canal. Un transporte caído no puede tumbar la ingesta. */
  private async difundir(acceso: Acceso): Promise<void> {
    try {
      await this.canal.publicar(acceso.copropiedadId, TEMA_EVENTOS, {
        id: acceso.id,
        ocurridoEn: acceso.ocurridoEn.toISOString(),
        tipo: acceso.tipo,
        resultado: acceso.resultado,
        motivo: acceso.motivo,
        metodo: acceso.metodo,
        dispositivoId: acceso.dispositivoId,
        viviendaId: acceso.viviendaId,
        placaDetectada: acceso.placaDetectada,
      });
    } catch (e) {
      this.bitacora.registrar('error', 'no se pudo difundir el evento en tiempo real', {
        eventoId: acceso.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  private async alertar(acceso: Acceso, actorId: string): Promise<string | null> {
    const descriptor = clasificarAcceso(acceso);
    if (descriptor === null) return null;

    const abierta = Alerta.abrir({
      id: this.ids.nuevo(),
      copropiedadId: acceso.copropiedadId,
      tipo: descriptor.tipo,
      severidad: descriptor.severidad,
      generadaEn: acceso.ocurridoEn,
      eventoId: acceso.id,
      notas: descriptor.porQue,
    });
    if (esFallo(abierta)) {
      this.bitacora.registrar('error', 'no se pudo abrir la alerta del evento', {
        eventoId: acceso.id,
        detalle: abierta.error.detalle,
      });
      return null;
    }

    await this.alertas.guardar(abierta.valor, actorId);
    await this.escalador.ejecutar(abierta.valor, actorId);
    return abierta.valor.id;
  }

  /** HU-34 · el residente se entera de lo que pasa en su vivienda. */
  private async avisarAlResidente(acceso: Acceso): Promise<void> {
    if (this.push === undefined || acceso.viviendaId === null) return;
    try {
      await this.push.aVivienda(
        acceso.copropiedadId,
        acceso.viviendaId,
        acceso.permitido ? 'Acceso registrado' : 'Acceso denegado',
        acceso.permitido
          ? `Ingreso por ${acceso.metodo} en ${acceso.dispositivoId}.`
          : `Intento denegado (${acceso.motivo ?? 'sin motivo'}).`,
      );
    } catch (e) {
      this.bitacora.registrar('aviso', 'no se pudo notificar al residente', {
        eventoId: acceso.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

/**
 * Traduce el hecho y la decisión al enumerado `tipo_evento`. Vive fuera de la
 * clase por SRP y porque es una función pura: se prueba sin construir el caso
 * de uso entero.
 */
export const tipoDeEvento = (hecho: HechoEntrante, decision: ResultadoAcceso): TipoDeEvento => {
  const manual = (hecho.operadorId ?? null) !== null && (hecho.motivoManual ?? null) !== null;
  if (manual) return 'manual';
  return decision.permitido ? 'ingreso' : 'denegado';
};

/** Fallo tipado para quien orquesta desde presentación (§2.4). */
export const noSePudoRegistrar = (detalle: string): Resultado<never, ErrorDominio> =>
  fallo(errorDominio('INVARIANTE_VIOLADA', detalle, 'RN-02'));
