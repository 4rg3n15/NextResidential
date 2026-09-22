import type { ReporteDeErrores } from '../aplicacion/puertos';
import type { Bitacora } from '@ncr/domain-core';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SENTRY, HABLADO DIRECTAMENTE · y por qué no se vendora el SDK
 *
 * §2.6 fija «Logs estructurados + Sentry». Lo que se implementa aquí es el
 * **protocolo de sobres (envelope) de Sentry**, que es la interfaz pública y
 * estable del servicio: un POST a `/api/<proyecto>/envelope/` con tres líneas
 * NDJSON y la clave pública en la cabecera `X-Sentry-Auth`.
 *
 * Tres razones para no traer `@sentry/node`, y ninguna es el gusto:
 *
 * 1 · **Superficie de dependencia.** El SDK arrastra OpenTelemetry y medio
 *     centenar de paquetes transitivos a una API que la ETAPA 13 acaba de
 *     dejar en 0 vulnerabilidades altas y críticas. Cada dependencia nueva es
 *     una entrada más en `pnpm audit` que alguien tendrá que atender.
 * 2 · **Parcheo global.** El SDK instrumenta `http`, `express` y las promesas
 *     por monkey-patching al cargar. Eso choca de frente con el principio de
 *     esta arquitectura: la infraestructura implementa un puerto, no se cuela
 *     por debajo de las capas.
 * 3 · **Comprobabilidad.** Un puerto con un adaptador de 120 líneas se prueba
 *     sin red, inyectando el `fetch`. El SDK exigiría un servidor falso y aun
 *     así no se sabría qué se envió.
 *
 * LO QUE SE PIERDE, dicho sin adornos: el rastreo de transacciones, las
 * fuentes de mapa subidas, el agrupado automático por huella y las
 * integraciones de plataforma. Si Grupo Control quiere eso, la salida es
 * **otro adaptador detrás de este mismo puerto** —exactamente el argumento de
 * ADR-01— y ni el dominio ni la aplicación se enteran.
 *
 * NUNCA LANZA, NUNCA BLOQUEA. Se llama desde el filtro global mientras este ya
 * atiende un 500: una excepción aquí dejaría al cliente sin respuesta por culpa
 * del observador. El envío es «dispara y olvida» con su propio tiempo límite.
 *
 * NO SE VUELCA EL CONTEXTO CRUDO. Pasa por `redactar` antes de salir: un
 * agregador de errores es un tercero, y §2.7.8 no deja de aplicar porque el
 * destino sea de confianza.
 */
export interface Dsn {
  readonly clavePublica: string;
  readonly host: string;
  readonly protocolo: string;
  readonly proyecto: string;
  readonly rutaEnvelope: string;
}

/**
 * Analiza el DSN. Devuelve `null` —y no lanza— si no tiene forma de DSN: la
 * validación dura vive en el esquema de configuración, y aquí un `null` se
 * traduce en «no hay reporte», que es el comportamiento correcto.
 */
export const analizarDsn = (crudo: string): Dsn | null => {
  let url: URL;
  try {
    url = new URL(crudo);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const clavePublica = url.username;
  if (clavePublica === '') return null;
  const segmentos = url.pathname.split('/').filter((s) => s !== '');
  const proyecto = segmentos[segmentos.length - 1];
  if (proyecto === undefined || !/^\d+$/.test(proyecto)) return null;
  const prefijo = segmentos.slice(0, -1).join('/');
  return {
    clavePublica,
    host: url.host,
    protocolo: url.protocol.replace(':', ''),
    proyecto,
    rutaEnvelope: `${prefijo === '' ? '' : `/${prefijo}`}/api/${proyecto}/envelope/`,
  };
};

export interface OpcionesSentry {
  readonly dsn: string;
  readonly entorno: string;
  readonly version: string;
  readonly redactar: (valor: unknown) => unknown;
  readonly bitacora: Bitacora;
  /** Inyectado para poder probar sin red. Por omisión, el `fetch` del proceso. */
  readonly enviar?: typeof fetch;
  readonly tiempoLimiteMs?: number;
}

const TIEMPO_LIMITE_MS = 3_000;

export class ReporteSentry implements ReporteDeErrores {
  private readonly dsn: Dsn | null;

  constructor(private readonly opciones: OpcionesSentry) {
    this.dsn = analizarDsn(opciones.dsn);
    if (this.dsn === null) {
      opciones.bitacora.registrar('aviso', 'SENTRY_DSN no tiene forma de DSN: no se reportará', {});
    }
  }

  capturar(error: unknown, contexto?: Readonly<Record<string, unknown>>): void {
    const dsn = this.dsn;
    if (dsn === null) return;
    try {
      const cuerpo = this.sobre(error, contexto);
      const enviar = this.opciones.enviar ?? fetch;
      const abortar = AbortSignal.timeout(this.opciones.tiempoLimiteMs ?? TIEMPO_LIMITE_MS);
      void enviar(`${dsn.protocolo}://${dsn.host}${dsn.rutaEnvelope}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_client=ncr/1.0, sentry_key=${dsn.clavePublica}`,
        },
        body: cuerpo,
        signal: abortar,
      }).catch(() => {
        // Silencio deliberado: el reporte es best-effort. Si Sentry está caído
        // no puede caerse también la API. Queda el log estructurado, que es la
        // fuente de verdad local.
      });
    } catch {
      /* ídem: construir el sobre tampoco puede tumbar nada */
    }
  }

  private sobre(error: unknown, contexto?: Readonly<Record<string, unknown>>): string {
    const momento = new Date().toISOString();
    const esError = error instanceof Error;
    const tipo = esError ? error.name : typeof error;
    const valor = esError ? error.message : String(error);
    const evento = {
      event_id: crypto.randomUUID().replace(/-/g, ''),
      timestamp: momento,
      platform: 'node',
      level: 'error',
      environment: this.opciones.entorno,
      release: this.opciones.version,
      logger: 'ncr.api',
      exception: {
        values: [
          {
            type: tipo,
            value: valor,
            stacktrace:
              esError && error.stack !== undefined ? { frames: marcos(error.stack) } : undefined,
          },
        ],
      },
      extra: contexto === undefined ? undefined : this.opciones.redactar(contexto),
    };
    const cabecera = JSON.stringify({
      event_id: evento.event_id,
      dsn: this.opciones.dsn.replace(/\/\/[^@]*@/, '//<clave>@'),
    });
    const tipoItem = JSON.stringify({ type: 'event' });
    return `${cabecera}\n${tipoItem}\n${JSON.stringify(evento)}\n`;
  }
}

/**
 * Traduce el `stack` de Node al formato de marcos de Sentry. Se queda con los
 * últimos veinte: un `stack` completo de Nest son cien marcos de framework y
 * los que importan están al final.
 */
const marcos = (stack: string): readonly Record<string, unknown>[] =>
  stack
    .split('\n')
    .slice(1)
    .map((linea) => /^at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/.exec(linea.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .slice(0, 20)
    .reverse()
    .map((m) => ({
      function: m[1] ?? '<anónima>',
      filename: m[2],
      lineno: Number(m[3]),
      colno: Number(m[4]),
    }));
