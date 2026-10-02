import type { EstadoSesionIntercom, IntercomProvider } from '@ncr/domain-core';
import { cnonceAleatorio, sesionDigestCompartida } from '../barrera/digest';
import type { SesionDigest } from '../barrera/digest';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { TIEMPO_LIMITE_DE_EQUIPO_MS } from '../equipo/cliente';
import { ConexionCruda } from './conexion-cruda';
import type { DestinoCrudo } from './conexion-cruda';
import { CanalDeAudioSinDescubrir, IntercomDeEquipo } from './intercom-equipo';
import type { OpcionesDeIntercom } from './intercom-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P2 · EL AUDIO DEL VIDEOPORTERO POR CONEXIONES PERSISTENTES CRUDAS
 *
 * El adaptador nuevo detrás del MISMO puerto (`IntercomProvider`, ADR-01):
 * abrir, cerrar, el turno y el «canal ocupado» los hace `IntercomDeEquipo`
 * —sin una línea cambiada en su camino—; lo que cambia es CÓMO viajan los
 * bytes, que es lo que el manual de la familia describe:
 *
 *  · subida: UN `PUT audioData` por sesión, abierto al abrir, sin
 *    `Content-Length` y sin `chunked`: las tramas µ-law tal cual;
 *  · bajada: UN `GET audioData` persistente por escucha.
 *
 * Digest con una sesión PROPIA (E1-c): su desafío y su `nc`, con la marca de
 * credencial rechazada compartida con las demás conexiones del equipo. El
 * desafío se pide con un `GET` sin credencial —nunca con una escritura vacía,
 * que algunos equipos rechazan antes de autenticar (H-SITIO-15)—.
 *
 * Se elige con `GUARDIA_AUDIO_TRANSPORTE=websocket`; con `http` (por omisión
 * hasta la medida de la 15-P) el proveedor sigue usando `IntercomDeEquipo`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export class AudioRechazadoPorElEquipo extends Error {
  constructor(
    readonly estado: number,
    sentido: 'subida' | 'bajada',
  ) {
    super(`El equipo rechazó la ${sentido} de audio (HTTP ${String(estado)})`);
    this.name = 'AudioRechazadoPorElEquipo';
  }
}

const RUTA_DE_DESAFIO = '/ISAPI/System/TwoWayAudio/channels';

export class IntercomIsapiPersistente implements IntercomProvider {
  private readonly turno: IntercomDeEquipo;
  private readonly sesion: SesionDigest;
  private readonly destino: DestinoCrudo;
  private subida: ConexionCruda | null = null;
  private readonly bajadas = new Set<ConexionCruda>();
  private abierta = false;

  constructor(private readonly opciones: OpcionesDeIntercom) {
    this.turno = new IntercomDeEquipo(opciones);
    const protocolo = opciones.protocolo ?? 'http';
    const puerto = opciones.puerto ?? 80;
    this.destino = {
      host: opciones.host,
      puerto,
      protocolo,
      tiempoLimiteMs: opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_DE_EQUIPO_MS,
    };
    this.sesion = sesionDigestCompartida(
      opciones.peticion ?? fetch,
      `${protocolo}://${opciones.host}:${String(puerto)}`,
      { usuario: opciones.usuario, clave: opciones.clave },
      opciones.generarCnonce ?? cnonceAleatorio,
      { propia: true },
    );
  }

  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    const estado = await this.turno.abrirSesion(dispositivoId, operadorId);
    if (estado !== 'abierta') return estado;
    this.abierta = true;
    // La subida se abre YA: la primera palabra del operador no paga el saludo.
    this.subida = await this.conectar('PUT').catch(() => null);
    return estado;
  }

  async enviarAudio(fragmento: Uint8Array): Promise<void> {
    this.exigirAbierta();
    if (this.subida?.escribir(fragmento) === true) return;
    this.subida?.cerrar();
    this.subida = await this.conectar('PUT');
    this.subida.escribir(fragmento);
  }

  async *recibirAudio(): AsyncIterable<Uint8Array> {
    this.exigirAbierta();
    const bajada = await this.conectar('GET');
    this.bajadas.add(bajada);
    try {
      yield* bajada.cuerpo();
    } finally {
      bajada.cerrar();
      this.bajadas.delete(bajada);
    }
  }

  async cerrarSesion(motivo: string): Promise<void> {
    this.abierta = false;
    this.subida?.cerrar();
    this.subida = null;
    for (const bajada of this.bajadas) bajada.cerrar();
    this.bajadas.clear();
    // `PUT close` SIEMPRE, y el turno se suelta: lo hace el adaptador de siempre.
    await this.turno.cerrarSesion(motivo);
  }

  estadoSesion(): Promise<EstadoSesionIntercom> {
    return this.turno.estadoSesion();
  }

  private exigirAbierta(): void {
    if (!this.abierta) throw new Error('No hay ninguna sesión de audio abierta');
  }

  private ruta(metodo: 'GET' | 'PUT'): string {
    if (this.opciones.canal === null) {
      throw new CanalDeAudioSinDescubrir(this.opciones.dispositivoId ?? '(sin identificador)');
    }
    const proposito = metodo === 'PUT' ? 'enviar audio al equipo' : 'recibir audio del equipo';
    return rutaPara(proposito, 'videoportero', this.opciones.canal).ruta;
  }

  /**
   * Conexión autenticada. La bajada espera la cabecera de respuesta (el audio
   * viene detrás); la subida NO: hay equipos que no contestan al `PUT` hasta
   * cerrarlo. Si la subida recibe un rechazo después, se marca y la siguiente
   * trama abre otra con el desafío renovado.
   */
  private async conectar(metodo: 'GET' | 'PUT', reintento = false): Promise<ConexionCruda> {
    const ruta = this.ruta(metodo);
    await this.asegurarDesafio();
    const conexion = ConexionCruda.abrir(
      this.destino,
      metodo,
      ruta,
      this.sesion.autorizacionPara(metodo, ruta),
    );
    if (metodo === 'PUT') {
      void conexion.respuesta.then(
        (r) => {
          if (r.estado < 300) return;
          if (r.estado === 401) this.sesion.descartarDesafio();
          conexion.cerrar();
        },
        () => undefined,
      );
      return conexion;
    }
    const r = await conexion.respuesta;
    if (r.estado < 300) return conexion;
    conexion.cerrar();
    // E1 · un 401 al desafío guardado nunca es la clave: uno limpio y otra vez.
    if (r.estado === 401 && !reintento) {
      this.sesion.descartarDesafio();
      return this.conectar(metodo, true);
    }
    throw new AudioRechazadoPorElEquipo(r.estado, 'bajada');
  }

  private async asegurarDesafio(): Promise<void> {
    if (this.sesion.tieneDesafio) return;
    const sonda = ConexionCruda.abrir(this.destino, 'GET', RUTA_DE_DESAFIO, null);
    try {
      const r = await sonda.respuesta;
      this.sesion.renegociar(r.cabeceras.get('www-authenticate') ?? null);
    } finally {
      sonda.cerrar();
    }
  }
}
