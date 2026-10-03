import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { RUTA_DEL_TUNEL } from '@ncr/providers';
import type { ProveedorDeEquipos } from '@ncr/providers';

/**
 * 15-Q2 · DoD · lo que el proceso de la API necesita para hablar con el Edge del
 * otro proceso (`edge-hijo.ts`) y para demostrar que él NO habla con los
 * equipos: el guardián de su proveedor directo y de su `fetch`.
 */
export interface EstadoDelHijo {
  readonly tunel: boolean;
  readonly aperturas: number;
  readonly pendientes: number;
  readonly marcasEmitidas: number[];
  readonly marcasRecibidas: number[];
  readonly go2rtc: { readonly fuentes: string[]; readonly ofertas: number };
  readonly lineas: string[];
}

export interface Hijo {
  readonly puertoDelVideoportero: number;
  estado(): Promise<EstadoDelHijo>;
  publicar(placa: string, referencia: string, secreto: string): Promise<{ estado: number }>;
  wan(activo: boolean): Promise<void>;
  tic(ahora: Date): Promise<unknown>;
  marcarAudio(): Promise<void>;
  sqlite(textos: string[]): Promise<{ contiene: string[] }>;
  holaAjeno(urlApi: string, edgeId: string, credencial: string, otra: string): Promise<number>;
  terminar(): void;
}

const API = join(__dirname, '..', '..');

export const conHijo = (entorno: Record<string, string>): Promise<Hijo> =>
  new Promise((listo, mal) => {
    const proceso = spawn(
      join(API, 'node_modules', '.bin', 'tsx'),
      ['--tsconfig', join(__dirname, 'tsconfig.json'), join(__dirname, 'edge-hijo.ts')],
      {
        cwd: API,
        env: {
          ...process.env,
          EDGE_SERVICE_USER_ID: '00000000-0000-4000-8000-000000000003',
          EDGE_ESCUCHA_HOST: '127.0.0.1',
          EDGE_LOCAL_SECRETO: 'secreto-local-del-edge-para-pruebas-sin-valor',
          EDGE_TUNEL: 'activo',
          EDGE_EQUIPOS_LLAVE: randomBytes(32).toString('base64'),
          SONDAS_PARA_CAER: '1',
          SONDAS_PARA_VOLVER: '1',
          RECONCILIACION_BACKOFF_MS: '1',
          ...entorno,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let salida = '';
    let errores = '';
    proceso.stderr.on('data', (d: Buffer) => (errores += d.toString()));
    proceso.on('exit', (codigo) => mal(new Error(`el Edge salió (${String(codigo)}): ${errores}`)));
    proceso.stdout.on('data', (d: Buffer) => {
      salida += d.toString();
      const linea = salida.split('\n').find((l) => l.startsWith('{"listo"'));
      if (linea === undefined) return;
      const anuncio = JSON.parse(linea) as { control: number; videoportero: number };
      const control = `http://127.0.0.1:${String(anuncio.control)}`;
      const pedir = async <T>(ruta: string, cuerpo: object = {}): Promise<T> =>
        (await (
          await fetch(`${control}${ruta}`, { method: 'POST', body: JSON.stringify(cuerpo) })
        ).json()) as T;
      listo({
        puertoDelVideoportero: anuncio.videoportero,
        estado: () => pedir('/estado'),
        publicar: (placa, referencia, secreto) =>
          pedir('/publicar', { placa, referencia, secreto }),
        wan: async (activo) => void (await pedir('/wan', { activo })),
        tic: (ahora) => pedir('/tic', { ahora: ahora.toISOString() }),
        marcarAudio: async () => void (await pedir('/audio/marcar')),
        sqlite: (textos) => pedir('/sqlite', { textos }),
        holaAjeno,
        terminar: () => {
          proceso.removeAllListeners('exit');
          proceso.kill('SIGTERM');
        },
      });
    });
  });

/** Un `hola` FIRMADO con la credencial de un Edge pero diciendo servir OTRA copropiedad. */
const holaAjeno = (urlApi: string, edgeId: string, credencial: string, otra: string) =>
  new Promise<number>((listo) => {
    const ws = new WebSocket(`${urlApi.replace(/^http/, 'ws')}${RUTA_DEL_TUNEL}`);
    ws.addEventListener('open', () => {
      const marca = String(Math.floor(Date.now() / 1000));
      const nonce = randomBytes(18).toString('base64url');
      const firma = createHmac('sha256', credencial)
        .update(`${marca}.GET ${RUTA_DEL_TUNEL}\n${nonce}`)
        .digest('hex');
      ws.send(
        JSON.stringify({ v: 1, t: 'hola', edgeId, copropiedadId: otra, marca, nonce, firma }),
      );
    });
    ws.addEventListener('close', (e) => listo(e.code));
  });

/** El proveedor DIRECTO de la API y su `fetch`, vigilados: tocar un equipo queda anotado. */
export const guardianDeEquipos = () => {
  const violaciones: string[] = [];
  const puertos = new Set(['8001', '8002', '8003']);
  const benignos: Record<string, unknown> = {
    suscribir: async () => undefined,
    olvidar: () => undefined,
    senalDeEventos: () => null,
  };
  // Los métodos del puerto que TOCAN un equipo. Lo demás (ganchos de Nest, `then`) no existe.
  const tocan = new Set([
    'abrir',
    'estado',
    'sincronizar',
    'suprimir',
    'abrirSesion',
    'enviarAudio',
    'recibirAudio',
    'cerrarSesion',
    'estadoSesion',
    'capacidadesDe',
    'fijarBloqueo',
    'responderVerificacionRemota',
    'escuchar',
    'origenDeVideo',
    'sondearVideo',
    'decideSolo',
    'salidasDe',
    'abrirSalida',
    'enviarAudioA',
    'recibirAudioDe',
    'cerrarSesionDe',
    'estadoSesionDe',
  ]);
  const proveedor = new Proxy({} as ProveedorDeEquipos, {
    get: (_o, nombre) => {
      if (typeof nombre !== 'string') return undefined;
      if (nombre in benignos) return benignos[nombre];
      if (!tocan.has(nombre)) return undefined;
      return (id: unknown) => {
        violaciones.push(String(id));
        throw new Error(`GUARDIÁN: la API intentó «${nombre}» directo con un equipo`);
      };
    },
  });
  const original = globalThis.fetch;
  return {
    proveedor,
    violaciones,
    vigilarPuerto: (puerto: number) => puertos.add(String(puerto)),
    vigilarFetch: () => {
      globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
        const url = new URL(entrada instanceof Request ? entrada.url : String(entrada));
        if (puertos.has(url.port) || url.hostname.endsWith('.simulado.invalid')) {
          violaciones.push(`red:${url.host}`);
          throw new TypeError('GUARDIÁN: la API no tiene ruta hacia los equipos');
        }
        return original(entrada, init);
      }) as typeof fetch;
    },
    soltarFetch: () => {
      globalThis.fetch = original;
    },
  };
};
