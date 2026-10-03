/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q2 · EL EDGE EN SU PROPIO PROCESO, con los equipos del conjunto
 *
 * Lo arranca `edge-puente-procesos-pg.e2e.test.ts` con `tsx`. Aquí viven las
 * únicas cosas que alcanzan a los equipos simulados: la cámara y la terminal
 * de `providers` (un `fetch` en memoria de ESTE proceso), el videoportero de
 * audio en red y un go2rtc de mentira. La API, en el proceso padre, no tiene
 * ninguna ruta hacia ellos: sólo el túnel que este Edge abre.
 *
 * El padre lo maneja por un canal de control HTTP (en 127.0.0.1, puerto que se
 * anuncia por stdout): publicar una lectura de la cámara, cortar y devolver el
 * WAN, pasar un tic, y preguntar qué pasó (aperturas, audio, video, SQLite).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
// `@ncr/*` resuelve al CÓDIGO FUENTE (`tsconfig.json` de esta carpeta): el Edge y
// este banco comparten UNA copia de providers, como en la suite.
import { aperturasFisicasPor, sobreDeLectura, videoporteroDeAudioEnRed } from '@ncr/providers';
import { cargarConfiguracionDelPuente } from '../../../edge/src/configuracion/esquema-del-puente';
import { componerPuente } from '../../../edge/src/composicion-puente';
import { HOST_CAMARA, HOST_TERMINAL, equiposDeSitio } from '../../../edge/test/banco-de-sitio';
import type { SocketWeb } from '../../../edge/src/infraestructura/tunel/enlace-websocket';

const CREDENCIAL_VP = { usuario: 'servicio', clave: 'clave-del-videoportero-simulado' };
const leer = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
  const trozos: Buffer[] = [];
  for await (const t of req) trozos.push(t as Buffer);
  const texto = Buffer.concat(trozos).toString('utf8');
  return texto === '' ? {} : (JSON.parse(texto) as Record<string, unknown>);
};
const escuchar = (servidor: Server): Promise<number> =>
  new Promise((listo) =>
    servidor.listen(0, '127.0.0.1', () => listo((servidor.address() as AddressInfo).port)),
  );

const arrancar = async (): Promise<void> => {
  const equipos = equiposDeSitio();
  const videoportero = await videoporteroDeAudioEnRed(CREDENCIAL_VP);
  const go2rtc: { fuentes: string[]; ofertas: number } = { fuentes: [], ofertas: 0 };
  const servidorGo2rtc = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://go2rtc');
    if (req.method === 'PATCH' && url.pathname === '/api/streams') {
      go2rtc.fuentes.push(url.searchParams.get('src') ?? '');
      res.end();
      return;
    }
    go2rtc.ofertas += 1;
    res.setHeader('content-type', 'application/sdp');
    res.end(
      'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=sendonly\r\n',
    );
  });
  const puertoGo2rtc = await escuchar(servidorGo2rtc);

  // El WAN: un interruptor delante del túnel y del HTTP hacia la nube.
  let wan = true;
  const sockets: SocketWeb[] = [];
  const abrirSocket = (url: string): SocketWeb => {
    const s = new WebSocket(url) as unknown as SocketWeb;
    if (!wan) queueMicrotask(() => s.close(4000, 'WAN cortado'));
    sockets.push(s);
    return s;
  };
  const transporteDeNube = (async (entrada: string | URL, init?: RequestInit) => {
    if (!wan) throw new TypeError('fetch failed: WAN cortado');
    return fetch(entrada, init);
  }) as typeof fetch;
  const peticionAEquipos = (async (entrada: string | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    // 8003: la MISMA terminal simulada con otra dirección (la heredada de D3).
    if (url.port === '8003') url.port = '8002';
    return url.port === '8001' || url.port === '8002'
      ? equipos.peticion(url, init)
      : fetch(entrada, init);
  }) as typeof fetch;

  const config = cargarConfiguracionDelPuente({
    ...process.env,
    EDGE_GO2RTC_URL: `http://127.0.0.1:${String(puertoGo2rtc)}`,
  });
  const lineas: string[] = [];
  const { edge, tunel, sesion } = componerPuente(config, {
    registrar: (nivel, mensaje) => void lineas.push(`${nivel} ${mensaje}`),
    transporteDeNube,
    peticionAEquipos,
    tunel: { abrirSocket, backoffBaseMs: 50, azar: () => 1 },
  });
  if (tunel === null) throw new Error('EDGE_TUNEL debe estar activo');
  const receptor = createServer((req, res) => void edge.manejador(req, res));
  const puertoReceptor = await escuchar(receptor);
  tunel.iniciar();

  const control = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      const cuerpo = await leer(req);
      const responder = (dato: unknown): void => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(dato));
      };
      switch (req.url) {
        case '/estado':
          responder({
            tunel: sesion() !== null && tunel.sesion() !== null,
            aperturas: aperturasFisicasPor.get(HOST_CAMARA) ?? 0,
            pendientes: edge.bandeja.cuantosPendientes(),
            marcasEmitidas: videoportero.bajada.marcasEmitidas,
            marcasRecibidas: videoportero.marcasRecibidas,
            go2rtc,
            terminal: HOST_TERMINAL,
            lineas: lineas.slice(-40),
          });
          return;
        case '/publicar': {
          const sobre = sobreDeLectura({
            placa: String(cuerpo['placa']),
            referencia: String(cuerpo['referencia']),
            ocurridoEn: new Date(String(cuerpo['ocurridoEn'] ?? new Date().toISOString())),
            confianza: 95,
          });
          const r = await fetch(
            `http://127.0.0.1:${String(puertoReceptor)}/alarm-server/${String(cuerpo['secreto'])}`,
            {
              method: 'POST',
              headers: { 'content-type': sobre.tipoDeContenido },
              body: sobre.cuerpo,
            },
          );
          responder({ estado: r.status });
          return;
        }
        case '/wan':
          wan = cuerpo['activo'] === true;
          if (!wan) for (const s of sockets.splice(0)) s.close(4000, 'WAN cortado');
          responder({ wan });
          return;
        case '/tic':
          responder(await edge.contingencia.tic(new Date(String(cuerpo['ahora']))));
          return;
        case '/audio/marcar':
          videoportero.bajada.marcar();
          responder({ ok: true });
          return;
        case '/sqlite':
          // ¿Aparece en claro algo que no debería? (D1) En el fichero Y en su WAL:
          // lo recién escrito vive en `-wal` hasta el siguiente checkpoint.
          responder({
            contiene: (cuerpo['textos'] as string[]).filter((t) =>
              ['', '-wal', '-shm'].some(
                (sufijo) =>
                  existsSync(`${config.SQLITE_PATH}${sufijo}`) &&
                  readFileSync(`${config.SQLITE_PATH}${sufijo}`).includes(Buffer.from(t)),
              ),
            ),
          });
          return;
        default:
          res.statusCode = 404;
          res.end();
      }
    })().catch((error: unknown) => {
      res.statusCode = 500;
      res.end(String(error));
    });
  });
  const puertoControl = await escuchar(control);
  process.stdout.write(
    `${JSON.stringify({ listo: true, control: puertoControl, videoportero: videoportero.puerto })}\n`,
  );
};

void arrancar().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
