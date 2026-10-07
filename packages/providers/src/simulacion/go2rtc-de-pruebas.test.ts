import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ESQUEMAS_QUE_SE_ESPERAN,
  OMITIDA_SIN_BINARIO,
  arrancarGo2rtc,
  binarioGo2rtc,
} from './go2rtc-de-pruebas';
import type { Go2rtcDePruebas } from './go2rtc-de-pruebas';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-S1 · EL 400 DE LA TERCERA CORRIDA, REPRODUCIDO SIN CARGA
 *
 * Con la máquina cargada, el primer `PATCH /api/streams` de
 * `servidor-rtsp.go2rtc.test.ts` recibía 400: el arnés daba go2rtc por listo
 * en cuanto `GET /api` contestaba, y go2rtc v1.9.14 contesta eso ANTES de
 * registrar `rtsp` (`main.go`: `api.Init` antes que `rtsp.Init`). Para verlo
 * sin depender de la carga, este doble hace lo mismo que go2rtc con el hueco
 * ensanchado: la API contesta al instante, los esquemas llegan después, y un
 * `PATCH` con un esquema aún sin registrar recibe el 400 de go2rtc.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const DOBLE = (hueco: number) => `
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const yaml = readFileSync(process.argv[3], 'utf8');
const [, host, puerto] = /listen: "([^"]+):(\\d+)"/.exec(yaml);
let esquemas = [];
createServer((req, res) => {
  const u = new URL(req.url, 'http://doble');
  if (u.pathname === '/api') return res.end('{}');
  if (u.pathname === '/api/schemes') return res.end(JSON.stringify(esquemas));
  if (u.pathname === '/api/streams' && req.method === 'PATCH') {
    const src = u.searchParams.get('src') ?? '';
    if (!esquemas.includes(src.slice(0, src.indexOf(':')))) {
      res.statusCode = 400;
      return res.end('streams: source not supported');
    }
    return res.end();
  }
  res.statusCode = 404;
  res.end();
}).listen(Number(puerto), host, () => {
  setTimeout(() => { esquemas = ['rtsp', 'rtsps', 'rtspx']; }, ${String(hueco)});
  setTimeout(() => { esquemas = [...esquemas, 'webrtc']; }, ${String(hueco + 100)});
  setTimeout(() => { esquemas = [...esquemas, 'isapi']; }, ${String(hueco + 200)});
});
process.on('SIGTERM', () => process.exit(0));
`;

const carpetas: string[] = [];
let puente: Go2rtcDePruebas | null = null;
afterEach(async () => {
  await puente?.cerrar();
  puente = null;
  for (const c of carpetas.splice(0)) rmSync(c, { recursive: true, force: true });
});

/** Un ejecutable que `spawn` arranca como si fuera go2rtc. */
const dobleDeGo2rtc = (hueco: number): string => {
  const carpeta = mkdtempSync(join(tmpdir(), 'go2rtc-doble-'));
  carpetas.push(carpeta);
  const ruta = join(carpeta, 'go2rtc');
  writeFileSync(ruta, `#!${process.execPath}\n${DOBLE(hueco)}`);
  chmodSync(ruta, 0o755);
  return ruta;
};

describe('15-S1 · el arnés de go2rtc espera a que el puente admita las fuentes', () => {
  it('el primer PATCH de una fuente rtsp:// ya no recibe «source not supported»', async () => {
    puente = await arrancarGo2rtc(dobleDeGo2rtc(800));
    const consulta = new URLSearchParams({ name: 'ncr', src: 'rtsp://127.0.0.1:1/x' });
    const r = await fetch(`${puente.url}/api/streams?${consulta.toString()}`, {
      method: 'PATCH',
    });
    expect(r.status, await r.text()).toBe(200);
  });

  it('espera los tres esquemas que usan las pruebas, no sólo el primero', async () => {
    puente = await arrancarGo2rtc(dobleDeGo2rtc(300));
    const esquemas = (await (await fetch(`${puente.url}/api/schemes`)).json()) as string[];
    expect(ESQUEMAS_QUE_SE_ESPERAN).toEqual(['rtsp', 'webrtc', 'isapi']);
    for (const e of ESQUEMAS_QUE_SE_ESPERAN) expect(esquemas).toContain(e);
  });
});

/**
 * Y con el binario REAL. Cada módulo de go2rtc vuelve a leer TODO el YAML al
 * iniciarse (`app.LoadConfig`): con un YAML grande, el hueco entre «`/api`
 * contesta» y «`rtsp` registrado» pasa de microsegundos a cientos de
 * milisegundos, y se recorre entero: `PATCH` → 404 (aún sin `/api/streams`) →
 * 400 «streams: source not supported» → 200. Medido el 07/10 con v1.9.14.
 * Ese 400 es el de la tercera corrida; aquí sale siempre, sin carga.
 */
const binario = binarioGo2rtc();
const RELLENO = ['relleno:', ...Array.from({ length: 100_000 }, (_, i) => `  - x${String(i)}`)];

describe.skipIf(binario === null)(
  `15-S1 · go2rtc real con el arranque ensanchado (${binario === null ? OMITIDA_SIN_BINARIO : 'binario de GO2RTC_BIN'})`,
  () => {
    it('el primer PATCH tras arrancarGo2rtc recibe 200, no 404 ni 400', async () => {
      puente = await arrancarGo2rtc(binario ?? '', RELLENO);
      const consulta = new URLSearchParams({ name: 'ncr', src: 'rtsp://127.0.0.1:1/x' });
      const r = await fetch(`${puente.url}/api/streams?${consulta.toString()}`, {
        method: 'PATCH',
      });
      expect(r.status, await r.text()).toBe(200);
    }, 30_000);
  },
);
