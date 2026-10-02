/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A2 · UNA PUNTA DEL TÚNEL — la misma clase en la API y en el Edge
 *
 * Sobre un `Enlace` (un WebSocket de verdad, o un par en memoria en las
 * pruebas) ofrece cuatro cosas, simétricas:
 *
 *  · `pedir`   una orden con plazo. Sin respuesta a tiempo, `OrdenVencida`;
 *              con el túnel cerrado, `EdgeDesconectado` EN EL ACTO (C3): una
 *              orden nunca queda colgada.
 *  · `atender` quién contesta cada nombre de pedido. El error del que atiende
 *              viaja con su clase (`serializacion.ts`).
 *  · `avisar`  sin respuesta: una publicación de un equipo, un estado.
 *  · canales   binarios multiplexados para el audio.
 *
 * Y cuida el túnel: latido, cierre si no llega nada en `silencioMaximoMs`,
 * límite de tamaño y de ritmo, cierre ante un mensaje inválido.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { randomUUID } from 'node:crypto';
import { EdgeDesconectado, OrdenVencida, ProtocoloInvalido } from './errores-remotos';
import { leerMensaje, leerTramaBinaria, MENSAJES_POR_SEGUNDO, tramaBinaria } from './protocolo';
import type { Mensaje, Pedido } from './protocolo';
import { codificar, decodificar } from './serializacion';
import { ColaDeCanal } from './cola-de-canal';

/** Lo mínimo de un WebSocket que la sesión necesita. */
export interface Enlace {
  enviar(dato: string | Uint8Array): void;
  cerrar(codigo: number, motivo: string): void;
  alRecibir(manejador: (dato: string | Uint8Array) => void): void;
  alCerrar(manejador: (motivo: string) => void): void;
}

export interface ContextoDePedido {
  readonly id: string;
  readonly padre?: string;
  readonly clave?: string;
  readonly plazoMs: number;
}

export type Atencion = (carga: unknown, contexto: ContextoDePedido) => Promise<unknown>;

export interface OpcionesDeSesion {
  /** `impar` en el Edge, `par` en la API: los canales de cada uno no chocan. */
  readonly paridad: 'par' | 'impar';
  readonly latidoMs?: number;
  readonly silencioMaximoMs?: number;
  readonly mensajesPorSegundo?: number;
  readonly ahora?: () => number;
  readonly registrar?: (mensaje: string, contexto?: unknown) => void;
}

interface Pendiente {
  readonly resolver: (valor: unknown) => void;
  readonly rechazar: (error: Error) => void;
  readonly temporizador: ReturnType<typeof setTimeout>;
}

export class SesionDeTunel {
  private abierta = true;
  private motivoDeCierre = '';
  private readonly pendientes = new Map<string, Pendiente>();
  private readonly atenciones = new Map<string, Atencion>();
  private readonly avisos = new Map<string, (carga: unknown) => void>();
  private readonly canales = new Map<number, ColaDeCanal>();
  private siguienteCanal: number;
  private ultimaSenal: number;
  private ventana = { inicio: 0, mensajes: 0 };
  private readonly latido: ReturnType<typeof setInterval> | null;
  private readonly alCerrarse: ((motivo: string) => void)[] = [];

  constructor(
    private readonly enlace: Enlace,
    private readonly opciones: OpcionesDeSesion,
  ) {
    this.siguienteCanal = opciones.paridad === 'impar' ? 1 : 2;
    this.ultimaSenal = this.ahora();
    enlace.alRecibir((dato) => this.recibir(dato));
    enlace.alCerrar((motivo) => this.terminar(motivo));
    const cada = opciones.latidoMs ?? 0;
    this.latido =
      cada > 0
        ? setInterval(() => {
            if (this.ahora() - this.ultimaSenal > (opciones.silencioMaximoMs ?? cada * 3)) {
              this.cerrar(4408, 'sin señal del otro lado');
            } else this.enviar({ v: 1, t: 'latido' });
          }, cada)
        : null;
    this.latido?.unref();
  }

  get estaAbierta(): boolean {
    return this.abierta;
  }

  get senal(): number {
    return this.ultimaSenal;
  }

  alCerrar(manejador: (motivo: string) => void): void {
    if (!this.abierta) manejador(this.motivoDeCierre);
    else this.alCerrarse.push(manejador);
  }

  atender(nombre: string, atencion: Atencion): void {
    this.atenciones.set(nombre, atencion);
  }

  alAviso(nombre: string, manejador: (carga: unknown) => void): void {
    this.avisos.set(nombre, manejador);
  }

  pedir(
    nombre: string,
    carga: unknown,
    opciones: { readonly plazoMs: number; readonly padre?: string; readonly clave?: string },
  ): Promise<unknown> {
    if (!this.abierta) return Promise.reject(new EdgeDesconectado());
    const id = randomUUID();
    const pedido: Pedido = {
      v: 1,
      t: 'pedido',
      id,
      nombre,
      carga: codificar(carga),
      plazoMs: opciones.plazoMs,
      ...(opciones.padre === undefined ? {} : { padre: opciones.padre }),
      ...(opciones.clave === undefined ? {} : { clave: opciones.clave }),
    };
    return new Promise((resolver, rechazar) => {
      const temporizador = setTimeout(() => {
        this.pendientes.delete(id);
        rechazar(new OrdenVencida(nombre, opciones.plazoMs));
      }, opciones.plazoMs);
      this.pendientes.set(id, { resolver, rechazar, temporizador });
      this.enviar(pedido);
    });
  }

  avisar(nombre: string, carga: unknown): void {
    if (this.abierta) this.enviar({ v: 1, t: 'aviso', nombre, carga: codificar(carga) });
  }

  /** Un canal binario nuevo, numerado con la paridad de este lado. */
  abrirCanal(): ColaDeCanal {
    const id = this.siguienteCanal;
    this.siguienteCanal += 2;
    return this.canal(id);
  }

  /** El canal que abrió el OTRO lado (su número llegó en un pedido). */
  canal(id: number): ColaDeCanal {
    const existente = this.canales.get(id);
    if (existente !== undefined) return existente;
    const cola = new ColaDeCanal(
      id,
      (carga) => {
        if (this.abierta) this.enlace.enviar(tramaBinaria(id, carga));
      },
      (motivo) => {
        this.canales.delete(id);
        if (this.abierta) this.enviar({ v: 1, t: 'canal', canal: id, motivo });
      },
    );
    this.canales.set(id, cola);
    if (!this.abierta) cola.terminar('túnel cerrado');
    return cola;
  }

  cerrar(codigo: number, motivo: string): void {
    if (!this.abierta) return;
    this.enlace.cerrar(codigo, motivo);
    this.terminar(motivo);
  }

  private ahora(): number {
    return this.opciones.ahora?.() ?? Date.now();
  }

  private enviar(mensaje: Mensaje): void {
    this.enlace.enviar(JSON.stringify(mensaje));
  }

  private recibir(dato: string | Uint8Array): void {
    if (!this.abierta) return;
    this.ultimaSenal = this.ahora();
    if (!this.dentroDelRitmo()) {
      this.cerrar(1008, 'demasiados mensajes por segundo');
      return;
    }
    try {
      if (typeof dato === 'string') this.despachar(leerMensaje(dato));
      else {
        const { canal, carga } = leerTramaBinaria(dato);
        this.canales.get(canal)?.entregar(carga);
      }
    } catch (error) {
      const detalle = error instanceof ProtocoloInvalido ? error.detalle : String(error);
      this.opciones.registrar?.('mensaje del túnel fuera de protocolo: se cierra', { detalle });
      this.cerrar(1008, 'mensaje fuera de protocolo');
    }
  }

  private dentroDelRitmo(): boolean {
    const ahora = this.ahora();
    if (ahora - this.ventana.inicio >= 1000) this.ventana = { inicio: ahora, mensajes: 0 };
    this.ventana.mensajes += 1;
    return this.ventana.mensajes <= (this.opciones.mensajesPorSegundo ?? MENSAJES_POR_SEGUNDO);
  }

  private despachar(mensaje: Mensaje): void {
    switch (mensaje.t) {
      case 'pedido':
        void this.atenderPedido(mensaje);
        return;
      case 'respuesta': {
        const pendiente = this.pendientes.get(mensaje.id);
        if (pendiente === undefined) return; // ya venció: llega tarde y se ignora
        this.pendientes.delete(mensaje.id);
        clearTimeout(pendiente.temporizador);
        if (mensaje.ok) pendiente.resolver(decodificar(mensaje.valor));
        else {
          const error = decodificar(mensaje.error);
          pendiente.rechazar(
            error instanceof Error ? error : new ProtocoloInvalido('error sin forma'),
          );
        }
        return;
      }
      case 'aviso':
        this.avisos.get(mensaje.nombre)?.(decodificar(mensaje.carga));
        return;
      case 'canal':
        this.canales.get(mensaje.canal)?.terminar(mensaje.motivo);
        this.canales.delete(mensaje.canal);
        return;
      case 'latido':
        return;
      default:
        // `hola` y `bienvenida` sólo valen en el apretón de manos, no después.
        throw new ProtocoloInvalido(`«${mensaje.t}» fuera del apretón de manos`);
    }
  }

  private async atenderPedido(pedido: Pedido): Promise<void> {
    const atencion = this.atenciones.get(pedido.nombre);
    const contexto: ContextoDePedido = {
      id: pedido.id,
      plazoMs: pedido.plazoMs,
      ...(pedido.padre === undefined ? {} : { padre: pedido.padre }),
      ...(pedido.clave === undefined ? {} : { clave: pedido.clave }),
    };
    try {
      if (atencion === undefined)
        throw new ProtocoloInvalido(`pedido desconocido «${pedido.nombre}»`);
      const valor = await atencion(decodificar(pedido.carga), contexto);
      if (this.abierta)
        this.enviar({ v: 1, t: 'respuesta', id: pedido.id, ok: true, valor: codificar(valor) });
    } catch (error) {
      const e = error instanceof Error ? error : new Error(String(error));
      if (this.abierta)
        this.enviar({ v: 1, t: 'respuesta', id: pedido.id, ok: false, error: codificar(e) });
    }
  }

  private terminar(motivo: string): void {
    if (!this.abierta) return;
    this.abierta = false;
    this.motivoDeCierre = motivo;
    if (this.latido !== null) clearInterval(this.latido);
    for (const [id, p] of this.pendientes) {
      clearTimeout(p.temporizador);
      p.rechazar(new EdgeDesconectado(`el túnel se cerró: ${motivo}`));
      this.pendientes.delete(id);
    }
    for (const cola of this.canales.values()) cola.terminar('túnel cerrado');
    this.canales.clear();
    for (const m of this.alCerrarse.splice(0)) m(motivo);
  }
}
