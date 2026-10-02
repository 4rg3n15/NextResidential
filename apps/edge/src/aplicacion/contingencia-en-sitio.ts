/**
 * 15-Q · P-27 = B · EL EDGE ES CONTINGENCIA: actúa cuando la nube no puede.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA REGLA, EN UNA FRASE
 *
 * La nube habla con los equipos; el Edge los escucha EN PARALELO y, por cada
 * acceso, pregunta primero «¿puede la nube decidir ahora?». Si puede, no hace
 * nada —la nube ya lo está atendiendo por su propio camino—. Si no, decide con
 * su caché (el mismo motor del dominio), lo encola y ACCIONA el equipo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ SE PREGUNTA EN CADA ACCESO Y NO SÓLO EN EL TIC
 *
 * El tic detecta la caída con histéresis (`SONDAS_PARA_CAER`): con los valores
 * por omisión, 45 s. Un vehículo que llega en ese intervalo no lo atendería
 * nadie. Por eso, mientras el tic no haya CONFIRMADO la caída, cada acceso
 * lleva una sonda inmediata con plazo corto (`SONDA_POR_EVENTO_MS`). Y cuando
 * la caída está confirmada, no se pregunta: cada acceso esperaría el plazo de
 * una sonda que ya se sabe que falla.
 *
 * El riesgo que queda es el del borde, y está escrito (ADR-034): si la sonda
 * del Edge falla mientras la nube sí alcanza los equipos —una ruta Edge→nube
 * rota y otra nube→equipos sana—, actúan los dos. El acceso queda UNA vez en la
 * nube (la clave de idempotencia es la misma por los dos caminos, RN-17); la
 * talanquera puede recibir dos órdenes de abrir.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE ACCIONA, COMO LA NUBE (`ingestor-de-publicaciones.ts`)
 *
 *  · placa permitida y sin confirmación humana → abrir la barrera;
 *  · rostro de una terminal que ESPERA veredicto → contestarle, abrir o negar
 *    (si no se le contesta, la terminal se queda esperando);
 *  · lo demás —negado, dudoso, «escalar» (P-28)— no acciona nada.
 *
 * Un acceso que el Edge YA vio (la misma clave) no se acciona otra vez: es la
 * protección contra la repetición de una publicación del equipo (Q5).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { construirClaveIdempotencia } from '@ncr/domain-core';
import type {
  IngestorDePublicaciones,
  PublicacionDeEquipo,
  ResultadoDeIngesta,
  hechoDeAccesoDe,
} from '@ncr/providers';
import type { DescargaDeReglas, ResultadoDeDescarga } from './descarga-de-reglas';
import type { Gateway, ResultadoDelTic } from './gateway';
import type { HechoLocal } from './instantanea-de-reglas';
import type { CacheDeReglas, DecisionLocal, SondaDeEnlace } from './puertos';

export type EstadoDeAccionamiento = 'aceptada' | 'rechazada' | 'inalcanzable';

/** Q4 · lo que el Edge hizo con el equipo, tal como viaja a la nube. */
export interface Accionamiento {
  readonly tipo: 'apertura' | 'veredicto';
  readonly estado: EstadoDeAccionamiento;
  readonly latenciaMs: number;
  readonly motivo?: string;
  readonly ocurridoEn: string;
}

/** El brazo del Edge sobre los equipos. Lo cumple `packages/providers`. */
export interface AccionadorLocal {
  abrir(dispositivoId: string): Promise<Omit<Accionamiento, 'tipo' | 'ocurridoEn'>>;
  responderVeredicto(
    dispositivoId: string,
    veredicto: {
      readonly serie: number | null;
      readonly permitido: boolean;
      readonly motivo: string;
    },
  ): Promise<Omit<Accionamiento, 'tipo' | 'ocurridoEn'>>;
}

/** Lo que ya pasó por la bandeja, y la constancia de lo accionado. */
export interface MemoriaDeAccesos {
  yaVisto(clave: string): boolean;
  anotarAccionamiento(clave: string, accionamiento: Accionamiento): void;
}

export interface OpcionesDeContingencia {
  readonly copropiedadId: string;
  /** El hecho de acceso de un evento: `hechoDeAccesoDe` de providers, inyectado (O2). */
  readonly interpretar: typeof hechoDeAccesoDe;
  readonly ahora?: () => Date;
  readonly registrar?: (
    nivel: 'info' | 'aviso' | 'error',
    mensaje: string,
    contexto?: unknown,
  ) => void;
}

export interface ResumenDelTic extends ResultadoDelTic {
  readonly descarga: ResultadoDeDescarga | null;
}

export class ContingenciaEnSitio implements IngestorDePublicaciones {
  private tics = 0;

  constructor(
    private readonly gateway: Gateway,
    private readonly descarga: DescargaDeReglas,
    private readonly cache: CacheDeReglas,
    private readonly sondaInmediata: SondaDeEnlace,
    private readonly accionador: AccionadorLocal,
    private readonly memoria: MemoriaDeAccesos,
    private readonly opciones: OpcionesDeContingencia,
  ) {}

  /** El tic: sonda, reconciliación y, con enlace, la descarga que toque (Q2). */
  async tic(ahora: Date): Promise<ResumenDelTic> {
    const r = await this.gateway.tic(ahora);
    this.tics += 1;
    const recuperado = r.conmuto && r.modo === 'en_linea';
    const descarga =
      r.modo === 'en_linea' && this.descarga.toca(ahora, recuperado)
        ? await this.descarga.ejecutar(ahora)
        : null;
    return { ...r, descarga };
  }

  /** Un evento de un equipo (alertStream o Alarm Server local), por `FuenteDePlacas`. */
  async ingerir(publicacion: PublicacionDeEquipo): Promise<ResultadoDeIngesta> {
    const evento = publicacion.evento;
    const acceso = this.opciones.interpretar(evento);
    if (acceso === null) return { registrado: false, motivo: 'no es un acceso' };
    if (await this.laNubeAtiende()) {
      return { registrado: false, motivo: 'la nube lo atiende (P-27 B)' };
    }
    const hecho: HechoLocal = {
      dispositivoId: evento.dispositivoId,
      metodo: acceso.metodo,
      referenciaExterna: acceso.referenciaExterna,
      confianza: acceso.confianza,
      placaLeida: acceso.placaLeida,
      personaId: this.titularDe(acceso.plantillaId),
      zonaId: null,
      ocurridoEn: evento.ocurridoEn,
    };
    const clave = construirClaveIdempotencia({
      copropiedadId: this.opciones.copropiedadId,
      dispositivoId: hecho.dispositivoId,
      origen: hecho.metodo,
      referenciaExterna: hecho.referenciaExterna,
    });
    const repetido = clave.ok && this.memoria.yaVisto(clave.valor);
    const decision = this.gateway.alRecibirHecho(hecho);
    if (repetido) return { registrado: true, motivo: 'repetido: no se acciona dos veces (Q5)' };

    const accionamiento = await this.accionar(
      evento.dispositivoId,
      acceso,
      evento.serieDelEquipo,
      decision,
    );
    if (accionamiento !== null && decision.claveIdempotencia !== '') {
      this.memoria.anotarAccionamiento(decision.claveIdempotencia, accionamiento);
    }
    this.opciones.registrar?.('info', 'acceso resuelto por el Edge sin nube', {
      dispositivoId: evento.dispositivoId,
      permitido: decision.resultado.permitido,
      porContingencia: decision.porContingencia,
      version: decision.resultado.versionDeReglas.numero,
      accionamiento: accionamiento?.estado ?? null,
    });
    return { registrado: true, motivo: null };
  }

  /** Lo que `GET /estado` enseña. Sin datos personales. */
  estado(): { readonly modo: string; readonly tics: number; readonly confirmadoSinNube: boolean } {
    return {
      modo: this.gateway.estadoDelEnlace.modo,
      tics: this.tics,
      confirmadoSinNube: this.confirmadoSinNube(),
    };
  }

  private confirmadoSinNube(): boolean {
    const e = this.gateway.estadoDelEnlace;
    // `autonomo` con 0 consecutivas = la última sonda del tic FALLÓ. Recién
    // arrancado (sin tics) no se sabe nada: se pregunta.
    return this.tics > 0 && e.modo === 'autonomo' && e.consecutivas === 0;
  }

  private async laNubeAtiende(): Promise<boolean> {
    if (this.confirmadoSinNube()) return false;
    return this.sondaInmediata.hayEnlace();
  }

  /** La plantilla de la terminal → su titular, según la instantánea. Nunca adivina. */
  private titularDe(plantillaId: string | null): string | null {
    if (plantillaId === null) return null;
    const instantanea = this.cache.vigente(this.opciones.copropiedadId);
    return instantanea?.plantillas?.find((p) => p.plantillaId === plantillaId)?.personaId ?? null;
  }

  private async accionar(
    dispositivoId: string,
    acceso: NonNullable<ReturnType<typeof hechoDeAccesoDe>>,
    serie: number | null,
    decision: DecisionLocal,
  ): Promise<Accionamiento | null> {
    const r = decision.resultado;
    const abre =
      r.permitido && r.requiereConfirmacionHumana !== true && !decision.requiereEscalamiento;
    const ahora = (): string => (this.opciones.ahora?.() ?? new Date()).toISOString();
    try {
      if (acceso.metodo === 'placa') {
        if (!abre) return null;
        return {
          tipo: 'apertura',
          ...(await this.accionador.abrir(dispositivoId)),
          ocurridoEn: ahora(),
        };
      }
      if (!acceso.esperaVeredicto) return null;
      const veredicto = {
        serie,
        permitido: abre,
        motivo: abre ? 'acceso permitido' : 'acceso negado',
      };
      return {
        tipo: 'veredicto',
        ...(await this.accionador.responderVeredicto(dispositivoId, veredicto)),
        ocurridoEn: ahora(),
      };
    } catch (e) {
      // El equipo no contestó: queda escrito, y el acceso sigue en la bandeja.
      return {
        tipo: acceso.metodo === 'placa' ? 'apertura' : 'veredicto',
        estado: 'inalcanzable',
        latenciaMs: 0,
        motivo: (e instanceof Error ? e.message : String(e)).slice(0, 200),
        ocurridoEn: ahora(),
      };
    }
  }
}
