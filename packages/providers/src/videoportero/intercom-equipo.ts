import {
  TIMEOUT_DE_CANAL_SEGUNDOS,
  canalLibre,
  conVencimientosAplicados,
  esExito,
  renovarActividad,
  solicitarCanal,
  soltarCanal,
} from '@ncr/domain-core';
import type {
  EstadoDelCanal,
  EstadoSesionIntercom,
  IntercomProvider,
  Reloj,
} from '@ncr/domain-core';
import { ClienteDeEquipo } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';

/**
 * AUDIO BIDIRECCIONAL CONTRA EL EQUIPO · ADR-01.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ESTÁ ESCRITO Y **NO ESTÁ HABILITADO**. LAS DOS COSAS A LA VEZ
 *
 * El canal del equipo está **deshabilitado de fábrica** en el aparato: se midió
 * el 18/09/2026, junto con que lo soporta con G.711 µ-law. Habilitarlo es un
 * cambio de configuración **del equipo**, lo hace el usuario, y el
 * procedimiento está en la guía de validación. Este adaptador no lo habilita ni
 * lo intenta: un adaptador que encendiera por su cuenta una vía de audio hacia
 * la calle sería una decisión de seguridad tomada por el código.
 *
 * `disponible()` lo dice sin rodeos, y `abrirSesion` falla con un motivo que
 * distingue «el equipo no puede» de «el canal está ocupado». Son dos cosas
 * distintas y el operador las resuelve distinto.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LA EXCLUSIVIDAD NO LA APLICA EL EQUIPO: LA APLICAMOS NOSOTROS
 *
 * Un canal de audio suele ser exclusivo en el aparato, pero su forma de
 * negarlo es un error de protocolo, no una cola. La máquina de estados del
 * dominio —la MISMA que usa el simulado— reparte el turno, encola y libera por
 * caducidad, así que lo que el operador aprendió sin hardware sigue valiendo
 * con hardware. Lo que cambia es el transporte, no las reglas.
 */

export class CanalDeEquipoNoHabilitado extends Error {
  constructor(readonly dispositivoId: string) {
    super(
      `El canal de audio del equipo ${dispositivoId} está deshabilitado. Es un ajuste DEL ` +
        'EQUIPO y lo activa un operador: docs/guias/VALIDACION_HIKVISION_EN_SITIO.md §8.3',
    );
    this.name = 'CanalDeEquipoNoHabilitado';
  }
}

export interface OpcionesDeIntercom extends OpcionesDeEquipo {
  readonly reloj: Reloj;
  /**
   * A4 · si el equipo DECLARA señalización de llamada (`senalizacionDeLlamada`
   * = `si`). Con ella, abrir la sesión envía «contestar» y cerrarla «colgar»;
   * sin ella no se emite ninguna señal: la llamada la atiende el aparato. Se
   * declara desde las capacidades, nunca se supone.
   */
  readonly senalizacion?: boolean;
  /**
   * Se **declara**, no se descubre. Mientras sea `false`, este adaptador no
   * emite una sola petición hacia el canal de audio del equipo.
   */
  readonly canalHabilitado: boolean;
  /**
   * El canal, **leído de la lista que el equipo declara** (D4). `null` mientras
   * no se haya descubierto: entonces abrir la sesión falla diciendo que falta
   * el canal, no con un `notSupport` del aparato a un `channels/1` inventado.
   */
  readonly canal: number | null;
  readonly margenSegundos?: number;
}

export class CanalDeAudioSinDescubrir extends Error {
  constructor(readonly dispositivoId: string) {
    super(
      `El canal de audio del equipo ${dispositivoId} no se ha descubierto. Se lee de la lista ` +
        'de canales que el aparato declara, nunca se supone 1 (D4)',
    );
    this.name = 'CanalDeAudioSinDescubrir';
  }
}

/**
 * A4 · LA COLA DEL FLUJO DE SUBIDA.
 *
 * El audio hacia el equipo va por UN `PUT` que dura la sesión: cada trozo que
 * el operador envía se encola aquí y el flujo lo toma cuando la red lo admite.
 * `empujar` resuelve en el acto mientras la cola vaya corta, y espera al
 * consumo cuando se llena —eso es la contrapresión: si el equipo no lee, el
 * operador no acumula segundos de audio que llegarán tarde—.
 */
const TROZOS_EN_VUELO = 8;

class ColaDeSalida {
  private pendientes: { readonly datos: Uint8Array; readonly tomado: () => void }[] = [];
  private esperando: ((r: IteratorResult<Uint8Array>) => void) | null = null;
  private cerrada = false;

  empujar(datos: Uint8Array): Promise<void> {
    if (this.cerrada) return Promise.reject(new Error('El flujo de audio ya se cerró'));
    if (this.esperando !== null) {
      const entregar = this.esperando;
      this.esperando = null;
      entregar({ value: datos, done: false });
      return Promise.resolve();
    }
    return new Promise((tomado) => {
      this.pendientes.push({ datos, tomado });
      if (this.pendientes.length <= TROZOS_EN_VUELO) tomado();
    });
  }

  cerrar(): void {
    this.cerrada = true;
    for (const p of this.pendientes) p.tomado();
    this.pendientes = [];
    if (this.esperando !== null) {
      const entregar = this.esperando;
      this.esperando = null;
      entregar({ value: undefined, done: true });
    }
  }

  /** Un flujo nuevo sobre la misma cola: lo que un reintento de Digest necesita. */
  flujo(): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
      pull: async (controlador) => {
        const siguiente = await this.siguiente();
        if (siguiente.done === true) controlador.close();
        else controlador.enqueue(siguiente.value);
      },
    });
  }

  private siguiente(): Promise<IteratorResult<Uint8Array>> {
    const pendiente = this.pendientes.shift();
    if (pendiente !== undefined) {
      pendiente.tomado();
      return Promise.resolve({ value: pendiente.datos, done: false });
    }
    if (this.cerrada) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolver) => {
      this.esperando = resolver;
    });
  }
}

export class IntercomDeEquipo implements IntercomProvider {
  private readonly cliente: ClienteDeEquipo;
  private readonly canales = new Map<string, EstadoDelCanal>();
  private readonly ultimoDispositivo = new Map<string, string>();
  private abierto: string | null = null;
  /** A4 · el flujo de subida de la sesión abierta, si ya se abrió. */
  private salida: { readonly cola: ColaDeSalida; fallo: Error | null } | null = null;

  constructor(private readonly opciones: OpcionesDeIntercom) {
    this.cliente = new ClienteDeEquipo(opciones);
  }

  /** `false` mientras el equipo no tenga el canal activado. */
  disponible(): boolean {
    return this.opciones.canalHabilitado;
  }

  private estado(dispositivoId: string): EstadoDelCanal {
    return this.canales.get(dispositivoId) ?? canalLibre(dispositivoId);
  }

  async abrirSesion(dispositivoId: string, operadorId: string): Promise<EstadoSesionIntercom> {
    if (!this.disponible()) throw new CanalDeEquipoNoHabilitado(dispositivoId);

    const ahora = this.opciones.reloj.ahora();
    const vigente = conVencimientosAplicados(
      this.estado(dispositivoId),
      ahora,
      this.opciones.margenSegundos ?? TIMEOUT_DE_CANAL_SEGUNDOS,
    );
    const solicitud = solicitarCanal(vigente, operadorId, ahora);
    this.canales.set(dispositivoId, solicitud.estado);
    if (solicitud.resultado === 'en_espera') {
      // Ocupado: queda en la cola. NO se toca el equipo, porque abrir el canal
      // del aparato para quien está esperando se lo quitaría al que habla.
      return 'en_espera';
    }

    this.ultimoDispositivo.set(operadorId, dispositivoId);

    if (this.opciones.canal === null) {
      this.canales.set(dispositivoId, soltarCanal(solicitud.estado, operadorId, ahora).estado);
      throw new CanalDeAudioSinDescubrir(dispositivoId);
    }
    const ruta = rutaPara(
      'abrir el canal de audio bidireccional',
      'videoportero',
      this.opciones.canal,
    );
    const respuesta = await this.cliente.pedir(ruta.metodo, ruta.ruta);
    if (!respuesta.ok) {
      // El equipo dijo que no: se suelta el turno en vez de dejar al operador
      // con un canal que cree tener. Un turno retenido sobre un canal muerto
      // bloquea al siguiente hasta que caduque.
      this.canales.set(dispositivoId, soltarCanal(solicitud.estado, operadorId, ahora).estado);
      throw new Error(`El equipo no abrió el canal de audio (HTTP ${String(respuesta.estado)})`);
    }
    this.abierto = dispositivoId;
    // A4 · con señalización declarada, abrir el audio ES contestar la llamada.
    await this.senalizar('answer');
    return 'abierta';
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * A4 · SEÑALIZACIÓN DE LLAMADA · DOCUMENTADA, NO VERIFICADA
   *
   * `PUT /ISAPI/VideoIntercom/callSignal` con `{ CallSignal: { cmdType } }`:
   * `answer` al abrir el audio, `hangUp` al cerrarlo. Es el [SUPUESTO] S-45
   * del catálogo: la forma sale de la documentación del fabricante y ningún
   * equipo del proyecto la admite (`isSupportCallSignal=false`), así que aquí
   * no se envía nunca salvo que la capacidad lo declare. Un rechazo del
   * equipo NO tumba la sesión: el audio ya está abierto, y la señal es un
   * complemento del que la ficha dice si se puede contar.
   */
  private async senalizar(orden: 'answer' | 'hangUp'): Promise<void> {
    if (this.opciones.senalizacion !== true) return;
    const ruta = rutaPara('contestar o rechazar una llamada del videoportero', 'videoportero');
    try {
      await this.cliente.pedir(ruta.metodo, ruta.ruta, {
        tipo: 'application/json',
        contenido: JSON.stringify({ CallSignal: { cmdType: orden } }),
      });
    } catch {
      // El equipo no contestó a la señal: el audio sigue; se confirma en sitio.
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * EL TRANSPORTE DE AUDIO · DOCUMENTADO, NO VERIFICADO · ETAPA 15-D
   *
   * Hasta la 15-C esto lanzaba, y lo decía: escribir un flujo contra un canal
   * que nadie ha abierto ni una vez es escribir contra una suposición. Ahora
   * está escrito **según la documentación del fabricante** —`audioData` por
   * `PUT` para hablar y por `GET` para escuchar, en el códec que el canal
   * declara— y se prueba contra el simulado. Lo que sigue sin existir es la
   * medida: códec real, tamaño de paquete, cadencia, semiduplex y latencia
   * (KPI-33). **Nada de eso tiene cifra**, y el informe lo dice así.
   */
  /**
   * A4 · UN flujo de subida por sesión, no un `PUT` por trozo.
   *
   * El primer trozo abre el `PUT` a `audioData` —`application/octet-stream`,
   * sin `Content-Length`, en el formato que el canal declara— y los siguientes
   * se encolan en él. Un `PUT` por trozo, que es lo que había, obligaba al
   * equipo a abrir y cerrar la sesión de audio con cada paquete de 20 ms: eso
   * no es una conversación, es un tartamudeo. La respuesta del equipo llega
   * cuando llega; si rechaza el flujo, el siguiente trozo lo dice.
   */
  async enviarAudio(fragmento: Uint8Array): Promise<void> {
    const dispositivoId = this.abierto;
    if (dispositivoId === null) throw new Error('No hay ninguna sesión de audio abierta');
    if (this.opciones.canal === null) throw new CanalDeAudioSinDescubrir(dispositivoId);
    if (this.salida === null) this.salida = this.abrirSalida(this.opciones.canal);
    if (this.salida.fallo !== null) throw this.salida.fallo;
    await this.salida.cola.empujar(fragmento);
  }

  private abrirSalida(canal: number): { readonly cola: ColaDeSalida; fallo: Error | null } {
    const cola = new ColaDeSalida();
    const salida: { readonly cola: ColaDeSalida; fallo: Error | null } = { cola, fallo: null };
    const ruta = rutaPara('enviar audio al equipo', 'videoportero', canal);
    void this.cliente
      .subirFlujo(ruta.ruta, () => cola.flujo(), 'application/octet-stream')
      .then((respuesta) => {
        if (!respuesta.ok) {
          salida.fallo = new Error(
            `El equipo no aceptó el flujo de audio (HTTP ${String(respuesta.estado)})`,
          );
          cola.cerrar();
        }
      })
      .catch((error: unknown) => {
        salida.fallo = error instanceof Error ? error : new Error(String(error));
        cola.cerrar();
      });
    return salida;
  }

  async *recibirAudio(): AsyncIterable<Uint8Array> {
    const dispositivoId = this.abierto;
    if (dispositivoId === null) throw new Error('No hay ninguna sesión de audio abierta');
    if (this.opciones.canal === null) throw new CanalDeAudioSinDescubrir(dispositivoId);
    const ruta = rutaPara('recibir audio del equipo', 'videoportero', this.opciones.canal);
    for await (const trozo of this.cliente.flujoBinario(ruta.ruta)) yield trozo;
  }

  async cerrarSesion(motivo: string): Promise<void> {
    const dispositivoId = this.abierto;
    this.abierto = null;
    if (dispositivoId === null) return;

    // A4 · el flujo de subida termina con la sesión: un `PUT` que sobrevive a
    // la conversación dejaría el canal del equipo tomado para el siguiente.
    this.salida?.cola.cerrar();
    this.salida = null;
    // Y con señalización declarada, cerrar el audio ES colgar.
    await this.senalizar('hangUp');

    const ahora = this.opciones.reloj.ahora();
    const titular = this.estado(dispositivoId).titular;
    if (titular !== null) {
      this.canales.set(
        dispositivoId,
        soltarCanal(this.estado(dispositivoId), titular.operadorId, ahora).estado,
      );
    }

    // El cierre se manda SIEMPRE, aunque el turno ya se hubiera soltado por
    // caducidad: un canal que el equipo cree abierto no admite al siguiente, y
    // ese estado sobrevive a nuestro proceso.
    if (this.opciones.canal === null) return;
    const ruta = rutaPara(
      'cerrar el canal de audio bidireccional',
      'videoportero',
      this.opciones.canal,
    );
    try {
      await this.cliente.pedir(ruta.metodo, ruta.ruta);
    } catch {
      // Si no se pudo cerrar, el equipo lo soltará por su propio vencimiento.
      // No se reintenta aquí: `motivo` ya está en el histórico y encadenar
      // reintentos retrasaría la respuesta al operador que está colgando.
      void motivo;
    }
  }

  async estadoSesion(): Promise<EstadoSesionIntercom> {
    if (this.abierto === null) return 'cerrada';
    const estado = this.estado(this.abierto);
    return estado.titular === null ? 'cerrada' : 'abierta';
  }

  /**
   * Renueva la actividad del turno para que no caduque mientras se habla.
   *
   * Devuelve `false` cuando quien renueva **no** es el titular: que un operador
   * en cola pudiera renovar el turno ajeno dejaría el canal retenido para
   * siempre. El dominio ya lo impide; aquí sólo se respeta su respuesta.
   */
  renovar(dispositivoId: string, operadorId: string): boolean {
    const resultado = renovarActividad(
      this.estado(dispositivoId),
      operadorId,
      this.opciones.reloj.ahora(),
    );
    if (!esExito(resultado)) return false;
    this.canales.set(dispositivoId, resultado.valor);
    return true;
  }
}
