#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-P · P1 · MEDIR ANTES DE CONSTRUIR: EL AUDIO DE LA GUARDIA, TRES CAMINOS
 *
 * Contra el videoportero simulado EN RED —el flujo del manual, Digest y el
 * 0x40002068—, con Chromium y el mismo reloj en los dos extremos:
 *
 *   A       go2rtc real como puente: el flujo suma el canal de retorno del
 *           fabricante como segunda fuente y el navegador negocia WebRTC
 *           «sendrecv». La vuelta llega por la pista de audio del RTSP.
 *   B       WebSocket binario y ordenado navegador ↔ relevo (la capa de la
 *           API) ↔ `audioData` persistente y crudo (`IntercomIsapiPersistente`).
 *   actual  el de hoy: un GET de bajada y un POST por trozo de 200 ms
 *           (`puente.ts` ↔ `IntercomDeEquipo`).
 *
 * Por opción: establecimiento (escucha lista; subida aceptada por el equipo),
 * IDA (tono en el «micrófono» → detectado en el equipo), VUELTA (tono del
 * equipo → a la salida del grafo de audio del navegador), AL PULSAR (pulsar con
 * el tono sonando → primer audio en el equipo) y CIERRE (colgar → `close` en
 * el equipo). Objetivo: < 2 s extremo a extremo (KPI-33, CA-19).
 *
 *   node e2e/medir-audio-guardia.mjs [--sesiones 3] [--marcas 4] [--solo B]
 *                                    [--salida informe.json]
 *
 * Requiere `packages/providers` compilado y `GO2RTC_BIN` para A (sin él, A se
 * omite con su nombre). Sale con 1 si una opción no se pudo medir o si B no
 * cumple el objetivo: B es la opción elegida (ADR-01, enmienda 15-P).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { caminoActual, caminoB, prepararA } from './medir-audio/caminos.mjs';
import { paginaDeMedida } from './medir-audio/pagina.mjs';
import { servidorDelBanco } from './medir-audio/relevos.mjs';
import { medidasVacias, medirSesion, resumenDeOpcion } from './medir-audio/sesion.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requerirApi = createRequire(resolve(raiz, 'apps/api/package.json'));
const P = requerirApi('@ncr/providers');
const { IntercomDeEquipo, IntercomIsapiPersistente } = requerirApi('@ncr/providers/operacion');
const { WebSocketServer } = requerirApi('ws');
const esbuild = (() => {
  const deWeb = createRequire(resolve(raiz, 'apps/web/package.json'));
  const deVitest = createRequire(deWeb.resolve('vitest/package.json'));
  return createRequire(deVitest.resolve('vite/package.json'))('esbuild');
})();

const argumento = (nombre, porOmision) => {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : porOmision;
};
const SESIONES = Number(argumento('sesiones', '3'));
const MARCAS = Number(argumento('marcas', '4'));
const SOLO = argumento('solo', null);
const SALIDA = argumento('salida', null);
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-del-banco' };
/** KPI-33 · CA-19: audio y video de extremo a extremo por debajo de 2 s. */
const OBJETIVO_MS = 2000;

/** El código de la consola que se mide, tal cual, empaquetado para la página. */
const empaquetar = async () =>
  (
    await esbuild.build({
      stdin: {
        contents:
          "export { CanalDeAudioPorWebSocket } from './canal-por-websocket';\n" +
          "export { capturarMicrofono, reproducirFlujo } from './puente';\n",
        resolveDir: resolve(raiz, 'apps/web/src/lib/audio'),
        loader: 'ts',
      },
      bundle: true,
      format: 'iife',
      globalName: 'NCR',
      platform: 'browser',
      target: 'chrome120',
      write: false,
    })
  ).outputFiles[0].text;

/** El Chromium del entorno, como el recorrido de la consola (`NCR_CHROMIUM` manda). */
const chromiumDelEntorno = () => {
  const explicito = process.env.NCR_CHROMIUM;
  if (explicito !== undefined && explicito !== '') return explicito;
  for (const base of [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers']) {
    if (typeof base !== 'string' || base === '' || !existsSync(base)) continue;
    for (const carpeta of readdirSync(base).filter((d) => /^chromium-\d+$/.test(d))) {
      const hallado = [
        join(base, carpeta, 'chrome-linux', 'chrome'),
        join(base, carpeta, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
      ].find((ruta) => existsSync(ruta));
      if (hallado !== undefined) return hallado;
    }
  }
  return undefined;
};

const opcionesDeIntercom = (equipo) => ({
  host: '127.0.0.1',
  puerto: equipo.puerto,
  ...CREDENCIAL,
  reloj: { ahora: () => new Date() },
  canalHabilitado: true,
  canal: 1,
});

/** B o el actual: un equipo, el adaptador de producción en el relevo, N sesiones. */
const medirPorRelevo = async (pagina, banco, nombre) => {
  const equipo = await P.videoporteroDeAudioEnRed(CREDENCIAL);
  try {
    const Adaptador = nombre === 'B' ? IntercomIsapiPersistente : IntercomDeEquipo;
    banco.usar({ crearIntercom: () => new Adaptador(opcionesDeIntercom(equipo)) });
    const camino = nombre === 'B' ? caminoB(pagina, banco) : caminoActual(pagina, banco);
    const m = medidasVacias();
    for (let s = 0; s < SESIONES; s += 1) await medirSesion(pagina, equipo, camino, m, MARCAS);
    return resumenDeOpcion(m, equipo);
  } finally {
    await equipo.cerrar();
  }
};

/** A: cada sesión con un puente nuevo; la primera, además, prueba lo que queda tras colgar. */
const medirA = async (pagina, banco) => {
  const binario = P.binarioGo2rtc();
  if (binario === null) return { omitida: P.OMITIDA_SIN_BINARIO };
  const m = medidasVacias();
  const hechos = {};
  let ultimo = null;
  for (let s = 0; s < SESIONES; s += 1) {
    const a = await prepararA({ P, binario, credencial: CREDENCIAL, banco, pagina });
    try {
      await medirSesion(pagina, a.equipo, a.camino, m, MARCAS);
      ultimo = a.equipo.estado();
      if (s === 0) {
        hechos.aperturasDelCanalEnUnaSesion = ultimo.aperturas;
        hechos.puenteTrasColgar = await a.estadoDelPuente();
        hechos.segundaSesionConElMismoPuente = await a.segundaNegociacion(10_000);
      }
    } finally {
      await a.cerrar();
    }
  }
  return { ...resumenDeOpcion(m, { estado: () => ultimo }), hechos };
};

const cumple = (r) =>
  r !== undefined &&
  r.idaMs !== null &&
  r.vueltaMs !== null &&
  r.idaMs.max < OBJETIVO_MS &&
  r.vueltaMs.max < OBJETIVO_MS &&
  r.marcasPerdidas === 0 &&
  r.sesionesConCanalTomadoTrasColgar === 0;

const principal = async () => {
  const banco = await servidorDelBanco({
    WebSocketServer,
    pagina: paginaDeMedida(await empaquetar()),
  });
  const ejecutable = chromiumDelEntorno();
  const navegador = await chromium.launch({
    ...(ejecutable === undefined ? {} : { executablePath: ejecutable }),
    args: [
      '--autoplay-policy=no-user-gesture-required',
      '--use-fake-ui-for-media-stream',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
    ],
  });
  const resultados = {};
  try {
    for (const nombre of ['B', 'actual', 'A'].filter((n) => SOLO === null || n === SOLO)) {
      // Un contexto por opción: el actual deja conexiones atascadas (hallazgo
      // de esta medida) y no puede contaminar a la siguiente.
      const contexto = await navegador.newContext();
      try {
        const pagina = await contexto.newPage();
        pagina.on('pageerror', (e) => console.error(`   página: ${e.message}`));
        await pagina.goto(banco.url);
        console.log(
          `▸ ${nombre}: ${String(SESIONES)} sesiones × ${String(MARCAS)} marcas por sentido`,
        );
        resultados[nombre] =
          nombre === 'A'
            ? await medirA(pagina, banco)
            : await medirPorRelevo(pagina, banco, nombre);
        console.log(`  ${JSON.stringify(resultados[nombre])}`);
      } catch (error) {
        resultados[nombre] = { error: error instanceof Error ? error.message : String(error) };
        console.error(`   ✗ ${nombre}: ${resultados[nombre].error}`);
      } finally {
        await contexto.close();
      }
    }
  } finally {
    await navegador.close();
    await banco.cerrar();
  }
  const informe = {
    medidoEl: new Date().toISOString(),
    sesiones: SESIONES,
    marcas: MARCAS,
    objetivoMs: OBJETIVO_MS,
    resultados,
  };
  if (SALIDA !== null) writeFileSync(SALIDA, `${JSON.stringify(informe, null, 2)}\n`);
  const sinMedir = Object.entries(resultados)
    .filter(([, r]) => r.error !== undefined)
    .map(([n]) => n);
  const bCumple = resultados.B === undefined || cumple(resultados.B);
  if (sinMedir.length > 0) console.log(`✗ sin medir: ${sinMedir.join(', ')}`);
  console.log(
    bCumple
      ? `✓ B por debajo de ${String(OBJETIVO_MS)} ms, sin marcas perdidas y cerrando el canal`
      : '✗ B no cumple el objetivo',
  );
  process.exit(sinMedir.length === 0 && bCumple ? 0 : 1);
};

await principal();
