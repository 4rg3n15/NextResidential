#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * pnpm sitio:audio · B6 (15-S2) · EL AUDIO DE UN EQUIPO, MEDIDO EN SITIO
 *
 *   pnpm sitio:audio -- --equipo=<familia|nombre de la ficha>
 *                       [--segundos=5] [--informe=$HOME/ncr-sitio/audio-<…>.md]
 *                       [--pasar-a-g711 --respaldo=$HOME/ncr-sitio/respaldo]
 *
 * B4 · `--pasar-a-g711`: si el canal NO es G.711, primero escribe el respaldo
 * del equipo en `--respaldo` (el mismo de `pnpm sitio:ensayo -- --capturar`,
 * que lo revierte con `--restaurar`), luego PREGUNTA si el cliente autoriza el
 * cambio y sólo con «s» pasa el canal a G.711 µ-law y lo relee. Sin
 * `--respaldo`, se niega.
 *
 * Para el videoportero y la terminal, con el adaptador de PRODUCCIÓN (el del
 * WebSocket de la guardia): lee el canal (formato, muestreo, volúmenes: sólo
 * lectura), abre con su `sessionId`, ESCUCHA N s contando bytes y nivel RMS,
 * envía un tono de 2 s mientras sigue escuchando (dúplex) y pregunta a la
 * persona si lo oyó, y cierra. El informe va FUERA del repositorio, sin IP ni
 * credenciales; del audio no se guarda ni un byte: la voz es un dato personal
 * (Ley 1581).
 *
 * Lee `apps/api/.env` —el de la API— y elige los equipos como `sitio:ensayo`:
 * primero el registro de la consola (DATABASE_URL + EQUIPOS_LLAVE), si no, el
 * `.env`. Salida: 0 sin fallos · 1 algún fallo · 2 configuración incompleta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { elegirEquipos, numero } from './lib/equipos-del-ensayo.mjs';
import { respaldar } from './lib/respaldo-en-sitio.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = (nombre) =>
  args.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? null;
const salir = (mensaje, codigo = 2) => {
  console.error(`✗ ${mensaje}`);
  process.exit(codigo);
};

const rutaEnv = resolve(RAIZ, valor('env') ?? 'apps/api/.env');
if (!existsSync(rutaEnv)) salir(`no existe ${rutaEnv}: copie apps/api/.env.example y rellénelo`);
process.loadEnvFile(rutaEnv);
const compilado = join(RAIZ, 'packages/providers/dist/operacion.js');
if (!existsSync(compilado))
  salir('falta compilar el paquete de equipos: pnpm --filter @ncr/providers build');
const P = createRequire(import.meta.url)(compilado);

/** Lo que nunca sale por pantalla ni al informe: claves, llaves, usuarios e IPs. */
const SECRETOS = Object.entries(process.env)
  .filter(([k]) => /CLAVE|PASSWORD|SECRET|LLAVE|TOKEN|_KEY$|USUARIO|_HOST$/.test(k))
  .map(([, v]) => v ?? '')
  .filter((v) => v !== '');
const salida = [];
const decir = (linea = '') => {
  const limpia = P.sinSecretosConocidos(linea, SECRETOS);
  salida.push(limpia);
  console.log(limpia);
};

const preguntar = async (texto) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await rl.question(texto);
  } finally {
    rl.close();
  }
};
const persona = {
  indicar: async (texto) => {
    decir(`     ▶ ${texto}`);
    if (process.stdin.isTTY === true) await preguntar('       (Enter cuando esté listo) ');
  },
  confirmar: async (pregunta) => {
    if (process.stdin.isTTY !== true) {
      decir(`     ? ${pregunta} — sin nadie que conteste`);
      return null;
    }
    const r = (await preguntar(`     ? ${pregunta} (s/n) `)).trim();
    return /^s/i.test(r) ? true : /^n/i.test(r) ? false : null;
  },
};

const pedidas = (valor('equipo') ?? 'terminal,videoportero').split(',');
const ROTULO = { terminal: 'la terminal', videoportero: 'el videoportero' };

const principal = async () => {
  decir(`pnpm sitio:audio · ${new Date().toISOString()}`);
  let pool = null;
  if ((process.env.DATABASE_URL ?? '') !== '') {
    const { Pool } = createRequire(join(RAIZ, 'apps/api/package.json'))('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    pool.on('error', (e) => decir(`   ⚠ la base cortó una conexión: ${e.message}`));
  }
  const elegidos = await elegirEquipos({ sim: null, pool, entorno: process.env, decir, salir });
  await pool?.end();
  const equipos = elegidos.equipos.filter(
    (e) =>
      (e.familia === 'terminal' || e.familia === 'videoportero') &&
      (pedidas.includes(e.familia) || (e.nombre !== undefined && pedidas.includes(e.nombre))),
  );
  // Tampoco la IP de un equipo del registro sale al informe.
  for (const e of equipos) SECRETOS.push(e.host);
  decir(`Equipos: ${equipos.length} · origen: ${elegidos.origen}`);
  if (equipos.length === 0) salir('ningún videoportero ni terminal con ese nombre o familia');

  let fallos = 0;
  for (const e of equipos) {
    const nombre = `${ROTULO[e.familia]}${e.nombre === undefined ? '' : ` «${e.nombre}»`}`;
    decir('');
    decir(`▷ ${nombre}`);
    const cliente = new P.ClienteDeEquipo(e);
    const lista = await cliente
      .pedir('GET', '/ISAPI/System/TwoWayAudio/channels')
      .catch((error) => ({ ok: false, estado: 0, cuerpo: String(error?.message ?? error) }));
    const canal = lista.ok ? P.describirCanalDeAudio(lista.cuerpo) : null;
    if (canal === null) {
      fallos += 1;
      decir(`  ✗ no declara canal de audio (HTTP ${String(lista.estado)}): contingencia ADR-01`);
      continue;
    }
    if (args.includes('--pasar-a-g711')) {
      // B4 · nunca sin respaldo escrito, nunca sin autorización, nunca sin releer.
      const respaldo = valor('respaldo');
      if (respaldo === null)
        salir('--pasar-a-g711 exige --respaldo=<carpeta fuera del repositorio>');
      const carpeta = resolve(respaldo);
      if (carpeta === RAIZ || carpeta.startsWith(RAIZ + sep))
        salir('el respaldo va fuera del repositorio');
      if ((await respaldar({ P, equipos: [e], carpeta, decir })) > 0) {
        fallos += 1;
        decir('  ✗ sin respaldo no se cambia nada');
        continue;
      }
      const paso = await P.pasarCanalAG711({
        cliente,
        familia: e.familia,
        canal: canal.canal,
        confirmar: persona.confirmar,
      });
      for (const l of paso.lineas) decir(`  ${l}`);
      if (paso.fallo) fallos += 1;
      if (paso.cambiado)
        decir(
          `  · para revertir: pnpm sitio:ensayo -- --equipo=${e.familia} --restaurar=${carpeta}`,
        );
      continue;
    }
    const audio = new P.IntercomIsapiPersistente({
      ...e,
      familia: e.familia,
      reloj: { ahora: () => new Date() },
      // El diagnóstico ES la comprobación en sitio: abre sin esperar la casilla.
      canalHabilitado: true,
      canal: canal.canal,
      formato: canal.formato,
    });
    const d = await P.diagnosticarAudio({
      audio,
      canal,
      nombre,
      escucharMs: numero(valor('segundos'), 5) * 1000,
      interlocutor: persona,
    });
    for (const l of d.lineas) decir(`  ${l}`);
    decir(`  ${d.fallo ? '✗ FALLO' : '✓ sin fallo'}`);
    if (d.fallo) fallos += 1;
  }

  const destino = resolve(
    valor('informe') ??
      join(
        homedir(),
        'ncr-sitio',
        `audio-${new Date().toISOString().slice(0, 16).replace(':', '')}.md`,
      ),
  );
  if (destino === RAIZ || destino.startsWith(RAIZ + sep)) {
    salir('el informe NO se escribe dentro del repositorio: use $HOME/ncr-sitio');
  }
  mkdirSync(dirname(destino), { recursive: true, mode: 0o700 });
  writeFileSync(destino, `# Audio en sitio\n\n\`\`\`\n${salida.join('\n')}\n\`\`\`\n`, {
    mode: 0o600,
  });
  console.log(`informe: ${destino}`);
  process.exit(fallos === 0 ? 0 : 1);
};

await principal();
