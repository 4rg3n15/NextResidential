/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · A1 · EL TÚNEL, DESDE EL EDGE: un WebSocket SALIENTE y persistente
 *
 * La API va en Cloud Run y no tiene ruta hacia la red del conjunto (ADR-035):
 * el único camino posible lo abre el Edge, hacia fuera, y lo mantiene.
 *
 *  1. Conecta a `wss://<api>/edge/tunel` y manda `hola`: su identidad de la
 *     15-Q (gateway, copropiedad, marca, nonce de un solo uso y la firma HMAC
 *     con SU credencial sobre `GET /edge/tunel\n<nonce>`).
 *  2. Espera `bienvenida` con SU copropiedad. Otra cosa, o nada a tiempo, cierra.
 *  3. Desde ahí es una `SesionDeTunel` (impar): latido, plazos, ritmo, tamaño.
 *  4. Si se cae, vuelve a intentarlo con BACKOFF EXPONENCIAL y JITTER completo
 *     (§2.7.5): cien Edge que pierden la nube a la vez no vuelven todos en el
 *     mismo segundo. Un rechazo de identidad (4401/4403/4404) espera el máximo:
 *     reintentar rápido una credencial mala sólo llena la auditoría.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createHmac, randomBytes } from 'node:crypto';
import { RUTA_DEL_TUNEL, SesionDeTunel, leerMensaje } from '@ncr/providers';
import type { Enlace } from '@ncr/providers';
import { solicitudCanonica } from '../api/cliente-de-nube';
import { enlaceWebSocket } from './enlace-websocket';
import type { SocketWeb } from './enlace-websocket';

export interface OpcionesDelTunel {
  readonly urlApi: string;
  readonly edgeId: string;
  readonly copropiedadId: string;
  /** `EDGE_INGESTA_SECRETO`: la credencial DE este gateway (15-Q). */
  readonly credencial: string;
  readonly alAbrir: (sesion: SesionDeTunel) => void;
  readonly registrar?: (nivel: 'info' | 'aviso', mensaje: string, contexto?: unknown) => void;
  readonly abrirSocket?: (url: string) => SocketWeb;
  readonly ahora?: () => number;
  readonly azar?: () => number;
  readonly esperar?: (ms: number, hacer: () => void) => void;
  readonly backoffBaseMs?: number;
  readonly backoffMaximoMs?: number;
}

const CIERRES_DE_IDENTIDAD = new Set([4401, 4403, 4404]);
const PLAZO_DE_BIENVENIDA_MS = 10_000;

/** El retraso del intento `n` (0, 1, 2…): full jitter sobre un exponencial acotado. */
export const retrasoDeReconexion = (
  intento: number,
  base: number,
  maximo: number,
  azar: () => number,
): number => Math.floor(azar() * Math.min(maximo, base * 2 ** Math.min(intento, 20)));

export const urlDelTunel = (urlApi: string): string => {
  const url = new URL(RUTA_DEL_TUNEL, urlApi);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

export class ClienteDeTunel {
  private actual: SesionDeTunel | null = null;
  private intentos = 0;
  private detenido = false;

  constructor(private readonly o: OpcionesDelTunel) {}

  /** La sesión vigente, o `null` mientras no hay túnel. */
  sesion(): SesionDeTunel | null {
    return this.actual !== null && this.actual.estaAbierta ? this.actual : null;
  }

  iniciar(): void {
    this.detenido = false;
    this.conectar();
  }

  detener(): void {
    this.detenido = true;
    this.actual?.cerrar(1000, 'el Edge se detiene');
  }

  private conectar(): void {
    const abrir =
      this.o.abrirSocket ?? ((url: string) => new WebSocket(url) as unknown as SocketWeb);
    const enlace = enlaceWebSocket(abrir(urlDelTunel(this.o.urlApi)));
    enlace.alAbrir(() => enlace.enviar(JSON.stringify(this.hola())));
    let sesion: SesionDeTunel | null = null;
    let plazo: ReturnType<typeof setTimeout> | null = null;
    enlace.alRecibir((dato) => {
      if (sesion !== null) return;
      if (plazo !== null) clearTimeout(plazo);
      try {
        const m = typeof dato === 'string' ? leerMensaje(dato) : null;
        if (m?.t !== 'bienvenida' || m.copropiedadId !== this.o.copropiedadId) throw new Error();
      } catch {
        enlace.cerrar(1008, 'se esperaba bienvenida de su copropiedad');
        return;
      }
      sesion = this.abrirSesion(enlace);
    });
    plazo = setTimeout(() => enlace.cerrar(4408, 'sin bienvenida'), PLAZO_DE_BIENVENIDA_MS);
    plazo.unref?.();
    enlace.alCerrar((motivo, codigo) => {
      if (plazo !== null) clearTimeout(plazo);
      if (sesion === null) this.reintentar(codigo, motivo);
    });
  }

  private abrirSesion(enlace: Enlace): SesionDeTunel {
    const sesion = new SesionDeTunel(enlace, {
      paridad: 'impar',
      latidoMs: 10_000,
      silencioMaximoMs: 30_000,
      ...(this.o.ahora === undefined ? {} : { ahora: this.o.ahora }),
      registrar: (mensaje, contexto) => this.o.registrar?.('aviso', mensaje, contexto),
    });
    this.actual = sesion;
    this.intentos = 0;
    this.o.registrar?.('info', 'túnel con la nube abierto');
    sesion.alCerrar((motivo) => {
      if (this.actual === sesion) this.actual = null;
      this.reintentar(0, motivo);
    });
    this.o.alAbrir(sesion);
    return sesion;
  }

  private reintentar(codigo: number, motivo: string): void {
    if (this.detenido) return;
    const maximo = this.o.backoffMaximoMs ?? 60_000;
    const espera = CIERRES_DE_IDENTIDAD.has(codigo)
      ? maximo
      : retrasoDeReconexion(
          this.intentos,
          this.o.backoffBaseMs ?? 1_000,
          maximo,
          this.o.azar ?? Math.random,
        );
    this.intentos += 1;
    this.o.registrar?.('aviso', 'túnel con la nube cerrado; se reintenta', {
      codigo,
      motivo,
      espera,
    });
    const esperar = this.o.esperar ?? ((ms, hacer) => void setTimeout(hacer, ms).unref());
    esperar(espera, () => this.conectar());
  }

  private hola() {
    const marca = String(Math.floor((this.o.ahora?.() ?? Date.now()) / 1000));
    const nonce = randomBytes(18).toString('base64url');
    const firma = createHmac('sha256', this.o.credencial)
      .update(`${marca}.${solicitudCanonica('GET', RUTA_DEL_TUNEL, nonce)}`)
      .digest('hex');
    return {
      v: 1,
      t: 'hola',
      edgeId: this.o.edgeId,
      copropiedadId: this.o.copropiedadId,
      marca,
      nonce,
      firma,
    };
  }
}
