/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · C1 · EL PROVEEDOR «VÍA EDGE»: los mismos puertos, por el túnel
 *
 * Cada método del `ProveedorDeEquipos` se convierte en un pedido `equipo` por
 * el túnel; al otro lado, `ejecutor-remoto.ts` lo ejecuta con el proveedor real
 * del Edge, contra los equipos de su red. Lo que el equipo devuelve o lanza
 * vuelve con su forma y su clase: la suite de contrato corre contra esto sin
 * cambiar una aserción (LSP).
 *
 * Lo que el túnel añade se traduce al lenguaje del puerto y no se inventa:
 *  · `abrir` con el Edge desconectado o sin respuesta a tiempo NO lanza:
 *    devuelve «no aceptado», que es lo que el puerto dice para un equipo que no
 *    se alcanza, con el motivo en `rechazo` para la consola (C3);
 *  · `estado` en ese caso es `fuera_de_linea`;
 *  · el resto rechaza con `EdgeDesconectado` u `OrdenVencida`, tipados.
 *
 * El audio no viaja en pedidos: va por canales binarios (`audio-por-tunel.ts`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import type {
  EstadoSesionIntercom,
  LecturaDePlaca,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
  Vigencia,
} from '@ncr/domain-core';
import type { FuenteDePlacas } from '../equipo/fuente-de-placas';
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import type { EscuchaActiva } from '../nucleo/escucha';
import type { DiagnosticoDeVideo, OrigenDeVideo } from '../nucleo/video';
import type { VeredictoRemoto } from '../nucleo/verificacion-remota';
import type { NodoDeSalidas } from '../nucleo/salidas';
import { EdgeDesconectado, OrdenVencida } from './errores-remotos';
import type { SesionDeTunel } from './sesion-de-tunel';
import { AudioPorTunel } from './audio-por-tunel';

/** Plazos por orden. `abrir` corto: KPI-32 pide la apertura remota en < 3 s. */
export const PLAZOS_POR_ORDEN: Readonly<Record<string, number>> = {
  abrir: 4_000,
  abrirSalida: 4_000,
  responderVerificacionRemota: 4_000,
  sincronizar: 30_000,
  salidasDe: 20_000,
  sondearVideo: 15_000,
};
const PLAZO_POR_OMISION = 8_000;

export interface OpcionesDelProveedorRemoto {
  /** La sesión VIGENTE del túnel de este Edge, o `null` si no está conectado. */
  readonly sesion: () => SesionDeTunel | null;
  /** Donde se suscriben los observadores del puerto (las lecturas del Edge). */
  readonly fuente: FuenteDePlacas;
  /** El pedido que originó esta orden (el hecho que la API está decidiendo). */
  readonly padre?: () => string | undefined;
  readonly plazos?: Readonly<Record<string, number>>;
}

const esDelTunel = (e: unknown): e is EdgeDesconectado | OrdenVencida =>
  e instanceof EdgeDesconectado || e instanceof OrdenVencida;

export class ProveedorRemoto implements ProveedorDeEquipos {
  private readonly audio = new AudioPorTunel(() => this.sesionVigente(), PLAZO_POR_OMISION);
  private readonly sesionesConAvisos = new WeakSet<SesionDeTunel>();
  private readonly observadores: ((lectura: LecturaDePlaca) => Promise<void>)[] = [];

  constructor(private readonly opciones: OpcionesDelProveedorRemoto) {}

  private sesionVigente(): SesionDeTunel {
    const sesion = this.opciones.sesion();
    if (sesion === null || !sesion.estaAbierta) throw new EdgeDesconectado();
    if (!this.sesionesConAvisos.has(sesion)) {
      this.sesionesConAvisos.add(sesion);
      this.audio.instalarEn(sesion);
      // Las lecturas del PUERTO (PlateEventSource), esperadas como en la fuente
      // local. La ingesta va aparte: pedidos `publicacion` (el túnel de la API).
      sesion.atender('lectura', async (l) => {
        for (const alLeer of this.observadores) await alLeer(l as LecturaDePlaca);
        return null;
      });
    }
    return sesion;
  }

  private async llamar<T>(metodo: string, args: readonly unknown[]): Promise<T> {
    const padre = this.opciones.padre?.();
    const plazoMs = (this.opciones.plazos ?? PLAZOS_POR_ORDEN)[metodo] ?? PLAZO_POR_OMISION;
    return (await this.sesionVigente().pedir(
      'equipo',
      { metodo, args },
      { plazoMs, ...(padre === undefined ? {} : { padre }) },
    )) as T;
  }

  // ── AccessPointProvider ────────────────────────────────────────────────────
  async abrir(dispositivoId: string, actorId: string): Promise<ResultadoAccionamiento> {
    const inicio = Date.now();
    try {
      return await this.llamar<ResultadoAccionamiento>('abrir', [dispositivoId, actorId]);
    } catch (e) {
      if (!esDelTunel(e)) throw e;
      return { aceptado: false, latenciaMs: Date.now() - inicio, rechazo: e.message };
    }
  }

  async estado(dispositivoId: string): Promise<'en_linea' | 'fuera_de_linea' | 'degradado'> {
    try {
      return await this.llamar('estado', [dispositivoId]);
    } catch (e) {
      if (esDelTunel(e)) return 'fuera_de_linea';
      throw e;
    }
  }

  // ── PlateEventSource: las lecturas llegan del Edge a la fuente local ──────
  async suscribir(alLeer: (lectura: LecturaDePlaca) => Promise<void>): Promise<void> {
    this.observadores.push(alLeer);
    await this.opciones.fuente.suscribir(alLeer);
    if (this.opciones.sesion() !== null) this.sesionVigente();
  }

  // ── FaceTemplateProvider: la plantilla viaja, el Edge no la guarda (C2) ───
  sincronizar(
    id: string,
    plantillaId: string,
    plantilla: Uint8Array,
    vigencia?: Vigencia,
  ): Promise<void> {
    return this.llamar('sincronizar', [id, plantillaId, plantilla, vigencia]);
  }

  suprimir(dispositivoId: string, plantillaId: string): Promise<void> {
    return this.llamar('suprimir', [dispositivoId, plantillaId]);
  }

  // ── Lo que el paquete añade a los puertos ──────────────────────────────────
  capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo> {
    return this.llamar('capacidadesDe', [dispositivoId]);
  }

  fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento> {
    return this.llamar('fijarBloqueo', [dispositivoId, bloqueado]);
  }

  responderVerificacionRemota(
    id: string,
    veredicto: VeredictoRemoto,
  ): Promise<ResultadoAccionamiento> {
    return this.llamar('responderVerificacionRemota', [id, veredicto]);
  }

  async escuchar(dispositivoId: string): Promise<EscuchaActiva> {
    const datos = await this.llamar<{
      dispositivoId: string;
      transporte: EscuchaActiva['transporte'];
      detalle: string;
      ultimaSenal: Date | null;
    }>('escuchar', [dispositivoId]);
    return {
      dispositivoId: datos.dispositivoId,
      transporte: datos.transporte,
      detalle: datos.detalle,
      detener: () => this.opciones.sesion()?.avisar('equipo.detener', { dispositivoId }),
      ultimaSenal: () => datos.ultimaSenal,
    };
  }

  /** D4 · el ejecutor contesta `null`: la URL con credencial no sale del conjunto. */
  origenDeVideo(dispositivoId: string): Promise<OrigenDeVideo | null> {
    return this.llamar('origenDeVideo', [dispositivoId]);
  }

  sondearVideo(dispositivoId: string): Promise<DiagnosticoDeVideo> {
    return this.llamar('sondearVideo', [dispositivoId]);
  }

  decideSolo(dispositivoId: string): Promise<boolean | null> {
    return this.llamar('decideSolo', [dispositivoId]);
  }

  olvidar(dispositivoId: string): void {
    this.opciones.sesion()?.avisar('equipo.olvidar', { dispositivoId });
  }

  salidasDe(dispositivoId: string): Promise<NodoDeSalidas> {
    return this.llamar('salidasDe', [dispositivoId]);
  }

  abrirSalida(
    id: string,
    numeroDePuerta: number,
    actorId: string,
  ): Promise<ResultadoAccionamiento> {
    return this.llamar('abrirSalida', [id, numeroDePuerta, actorId]);
  }

  // ── IntercomProvider (ADR-01): las órdenes por pedido, el audio por canal ──
  abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    return this.llamar('abrirSesion', [dispositivoId, operadorId]);
  }

  enviarAudio(fragmento: Uint8Array): Promise<void> {
    return this.audio.enviar(null, fragmento);
  }

  recibirAudio(): AsyncIterable<Uint8Array> {
    return this.audio.recibir(null);
  }

  async cerrarSesion(motivo: string): Promise<void> {
    await this.audio.cerrarEnvio(null);
    await this.llamar('cerrarSesion', [motivo]);
  }

  estadoSesion(): Promise<EstadoSesionIntercom> {
    return this.llamar('estadoSesion', []);
  }

  enviarAudioA(dispositivoId: string, fragmento: Uint8Array): Promise<void> {
    return this.audio.enviar(dispositivoId, fragmento);
  }

  recibirAudioDe(dispositivoId: string): AsyncIterable<Uint8Array> {
    return this.audio.recibir(dispositivoId);
  }

  async cerrarSesionDe(dispositivoId: string, motivo: string): Promise<void> {
    await this.audio.cerrarEnvio(dispositivoId);
    await this.llamar('cerrarSesionDe', [dispositivoId, motivo]);
  }

  estadoSesionDe(dispositivoId: string): Promise<EstadoSesionIntercom> {
    return this.llamar('estadoSesionDe', [dispositivoId]);
  }
}
