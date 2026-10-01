import { connect as conectarTcp } from 'node:net';
import type { Socket } from 'node:net';
import { connect as conectarTls } from 'node:tls';
import { DecodificadorTrozado } from './cuerpo-trozado';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P2 · UNA PETICIÓN HTTP/1.1 ESCRITA A MANO, PARA EL AUDIO DEL EQUIPO
 *
 * El manual de la familia pide, para `audioData`, dos conexiones persistentes
 * «sin Content-Length, con `Connection: keep-alive` y `Content-Type:
 * application/octet-stream`», y el audio en tramas fijas (G.711: 160 B cada
 * 20 ms). `fetch` no sabe hacer eso: con un cuerpo en flujo y sin longitud
 * manda `Transfer-Encoding: chunked`, y el equipo —que lee bytes— oiría las
 * cabeceras de cada trozo como audio. Aquí se escribe la cabecera tal cual y,
 * detrás, los bytes del códec sin envoltorio.
 *
 * La credencial viaja SÓLO en la cabecera `Authorization` (Digest, calculada
 * por la sesión del equipo): nunca en la ruta, nunca en una traza (RN-21).
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface DestinoCrudo {
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: 'http' | 'https';
  /** Hasta la cabecera de respuesta; el cuerpo, después, no tiene plazo. */
  readonly tiempoLimiteMs: number;
}

export interface CabeceraDeRespuestaCruda {
  readonly estado: number;
  readonly cabeceras: ReadonlyMap<string, string>;
}

const leerCabecera = (texto: string): CabeceraDeRespuestaCruda => {
  const [linea = '', ...resto] = texto.split('\r\n');
  const cabeceras = new Map<string, string>();
  for (const l of resto) {
    const dos = l.indexOf(':');
    if (dos <= 0) continue;
    const nombre = l.slice(0, dos).trim().toLowerCase();
    // Varios desafíos (Digest y Basic, cada uno en su línea): manda el Digest.
    if (nombre === 'www-authenticate' && /^Digest/i.test(cabeceras.get(nombre) ?? '')) continue;
    cabeceras.set(nombre, l.slice(dos + 1).trim());
  }
  return { estado: Number(/^HTTP\/1\.[01] (\d{3})/.exec(linea)?.[1] ?? '0'), cabeceras };
};

/** Trozos sin leer que se guardan, ~1 s de G.711 en tramas de 20 ms. */
const MAXIMO_SIN_LEER = 50;

export class ConexionCruda {
  /** Resuelve con la cabecera de respuesta; rechaza si el socket cae antes. */
  readonly respuesta: Promise<CabeceraDeRespuestaCruda>;
  private readonly llegado: Uint8Array[] = [];
  private despertar: (() => void) | null = null;
  private terminada = false;

  private constructor(
    private readonly socket: Socket,
    plazoMs: number,
  ) {
    let bufer = Buffer.alloc(0);
    let entregar: ((b: Uint8Array) => void) | null = null;
    this.respuesta = new Promise((resolver, rechazar) => {
      socket.setTimeout(plazoMs, () =>
        socket.destroy(new Error(`sin respuesta en ${String(plazoMs)} ms`)),
      );
      socket.on('data', (d: Buffer) => {
        if (entregar !== null) {
          entregar(d);
          return;
        }
        bufer = Buffer.concat([bufer, d]);
        const fin = bufer.indexOf('\r\n\r\n');
        if (fin < 0) return;
        const cabecera = leerCabecera(bufer.subarray(0, fin).toString('latin1'));
        socket.setTimeout(0);
        const trozado = /chunked/i.test(cabecera.cabeceras.get('transfer-encoding') ?? '');
        const decodificador = new DecodificadorTrozado((b) => this.encolar(b));
        entregar = trozado ? (b) => decodificador.alimentar(b) : (b) => this.encolar(b);
        resolver(cabecera);
        const resto = bufer.subarray(fin + 4);
        if (resto.length > 0) entregar(resto);
      });
      socket.once('error', rechazar);
      socket.once('close', () => {
        this.terminada = true;
        this.despertar?.();
        rechazar(new Error('el equipo cerró la conexión sin contestar'));
      });
    });
    // Nadie está obligado a esperar la respuesta: que un rechazo no quede suelto.
    this.respuesta.catch(() => undefined);
  }

  /**
   * Conecta y escribe la cabecera. `autorizacion` es la cabecera Digest ya
   * calculada, o `null` para el primer intercambio (el equipo contesta 401
   * con su desafío y la sesión lo guarda).
   */
  static abrir(
    destino: DestinoCrudo,
    metodo: 'GET' | 'PUT',
    ruta: string,
    autorizacion: string | null,
  ): ConexionCruda {
    const opciones = { host: destino.host, port: destino.puerto };
    const socket =
      destino.protocolo === 'https'
        ? conectarTls({ ...opciones, servername: destino.host })
        : conectarTcp(opciones);
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10_000);
    socket.on('error', () => undefined);
    const lineas = [
      `${metodo} ${ruta} HTTP/1.1`,
      `Host: ${destino.host}:${String(destino.puerto)}`,
      'Connection: keep-alive',
      'Content-Type: application/octet-stream',
      ...(autorizacion === null ? [] : [`Authorization: ${autorizacion}`]),
    ];
    socket.write(`${lineas.join('\r\n')}\r\n\r\n`);
    return new ConexionCruda(socket, destino.tiempoLimiteMs);
  }

  /** `false` si la conexión ya no admite bytes: quien escribe abre otra. */
  escribir(bytes: Uint8Array): boolean {
    if (this.terminada || this.socket.destroyed || !this.socket.writable) return false;
    this.socket.write(bytes);
    return true;
  }

  /** Los bytes del cuerpo de la respuesta, según llegan, hasta que el equipo cierre. */
  async *cuerpo(): AsyncIterable<Uint8Array> {
    for (;;) {
      const siguiente = this.llegado.shift();
      if (siguiente !== undefined) {
        yield siguiente;
        continue;
      }
      if (this.terminada) return;
      await new Promise<void>((despertar) => {
        this.despertar = despertar;
      });
      this.despertar = null;
    }
  }

  cerrar(): void {
    this.terminada = true;
    this.socket.destroy();
    this.despertar?.();
  }

  private encolar(bytes: Uint8Array): void {
    // Audio en vivo: lo viejo que nadie leyó ya no sirve y retrasaría lo nuevo.
    if (this.llegado.length >= MAXIMO_SIN_LEER) this.llegado.shift();
    this.llegado.push(bytes);
    this.despertar?.();
  }
}
