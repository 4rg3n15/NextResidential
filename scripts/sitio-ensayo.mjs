#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * pnpm sitio:ensayo · ETAPA 15-L (J1, J2) · EL ENSAYO DEL DÍA DE ENTREGA
 *
 * Recorre, equipo por equipo y en este orden, las ocho capacidades:
 *   1 conexión y Digest · 2 hora frente al Mac · 3 configuración · 4 eventos
 *   5 apertura (con alguien mirando) · 6 alta y baja de un rostro · 7 video
 *   8 audio
 * y dice OK/FALLO por paso, con la causa y la acción. Antes, las comprobaciones
 * del Mac: la API por el bucle local y POR LA IP DEL MAC (la del iPhone), el
 * puente de video y las migraciones pendientes.
 *
 *   pnpm sitio:ensayo                               # los equipos del .env
 *   pnpm sitio:ensayo -- --solo-lectura             # nada que mueva o escriba
 *   pnpm sitio:ensayo -- --equipo=terminal --foto=$HOME/ncr-sitio/cara.jpg
 *   pnpm sitio:ensayo -- --capturar=$HOME/ncr-sitio/respaldo   # J2, y sale
 *   pnpm sitio:ensayo -- --restaurar=$HOME/ncr-sitio/respaldo  # J2, y sale
 *   pnpm sitio:ensayo -- --simulado                 # sin red: equipos simulados
 *   otras: --espera=<s> (60) · --sin-plataforma · --informe=<ruta.md> · --env=<ruta>
 *
 * Lee `apps/api/.env` —el mismo de la API—: BARRERA_*, TERMINAL_*,
 * VIDEOPORTERO_* (HOST, PUERTO, USUARIO, CLAVE, CANAL, CANAL_VIDEO). NUNCA
 * imprime una credencial: toda línea pasa por el tachado de los valores
 * secretos del `.env`. Informes y respaldos, sólo FUERA del repositorio.
 *
 * Salida: 0 sin fallos · 1 algún FALLO · 2 configuración incompleta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createRequire } from 'node:module';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipDelMac } from './lib/red-del-mac.mjs';
import {
  equipoRegistrado,
  eventosDeLaPlataforma,
  migracionesPendientes,
  sondearSalud,
} from './lib/ensayo-plataforma.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const valor = (nombre) =>
  args.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) ?? null;
const bandera = (nombre) => args.includes(`--${nombre}`);
const salir = (mensaje, codigo = 2) => {
  console.error(`✗ ${mensaje}`);
  process.exit(codigo);
};

const simulado = bandera('simulado');
const rutaEnv = resolve(RAIZ, valor('env') ?? 'apps/api/.env');
if (!simulado) {
  if (!existsSync(rutaEnv)) salir(`no existe ${rutaEnv}: copie apps/api/.env.example y rellénelo`);
  process.loadEnvFile(rutaEnv);
}
const fueraDelRepo = (ruta, que) => {
  const r = resolve(ruta);
  if (r === RAIZ || r.startsWith(RAIZ + sep)) {
    salir(
      `${que} NO se escribe dentro del repositorio: indique una ruta fuera, p. ej. $HOME/ncr-sitio`,
    );
  }
  return r;
};

const compilado = join(RAIZ, 'packages/providers/dist/operacion.js');
if (!existsSync(compilado))
  salir('falta compilar el paquete de equipos: pnpm --filter @ncr/providers build');
const P = createRequire(import.meta.url)(compilado);

/** Los valores del .env que nunca deben salir por pantalla ni al informe. */
const SECRETOS = Object.entries(process.env)
  .filter(([k]) => /CLAVE|PASSWORD|SECRET|LLAVE|TOKEN|_KEY$|USUARIO/.test(k))
  .map(([, v]) => v ?? '')
  .concat(
    [process.env.DATABASE_URL, process.env.PGBOSS_DATABASE_URL]
      .map((u) => /\/\/[^:]+:([^@]+)@/.exec(u ?? '')?.[1] ?? '')
      .filter((x) => x !== ''),
  );
const salida = [];
const decir = (linea = '') => {
  const limpia = P.sinSecretosConocidos(linea, SECRETOS);
  salida.push(limpia);
  console.log(limpia);
};

const FAMILIAS = [
  { familia: 'camara', prefijo: 'BARRERA' },
  { familia: 'terminal', prefijo: 'TERMINAL' },
  { familia: 'videoportero', prefijo: 'VIDEOPORTERO' },
];
const pedidas = (valor('equipo') ?? 'camara,terminal,videoportero').split(',');
const numero = (texto, porOmision) => {
  const n = Number(texto);
  return texto !== undefined && texto !== '' && Number.isInteger(n) && n > 0 ? n : porOmision;
};

/** Un equipo del .env, o `null` si no está declarado. */
const desdeEntorno = ({ familia, prefijo }) => {
  const e = (s) => (process.env[`${prefijo}_${s}`] ?? '').trim();
  if (e('HOST') === '' && e('USUARIO') === '' && e('CLAVE') === '') return null;
  const faltan = ['HOST', 'USUARIO', 'CLAVE'].filter((s) => e(s) === '');
  if (faltan.length > 0)
    salir(`faltan ${faltan.map((s) => `${prefijo}_${s}`).join(', ')} en el .env`);
  const video = e('CANAL_VIDEO') || '102';
  if (!/^[1-9][0-9]{2,3}$/.test(video)) salir(`${prefijo}_CANAL_VIDEO no es un canal: «${video}»`);
  return {
    familia,
    host: e('HOST'),
    puerto: numero(e('PUERTO'), 80),
    usuario: e('USUARIO'),
    clave: e('CLAVE'),
    puerta: numero(e('CANAL'), 1),
    canalDeVideo: video,
    puertoRtsp: numero(process.env.VIDEO_PUERTO_RTSP, 554),
    tiempoLimiteMs: numero(process.env.EQUIPOS_TIEMPO_LIMITE_MS, 5000),
  };
};

/** En `--simulado`, los tres equipos del paquete, sin red. */
const simulados = async () => {
  const rtsp = await P.servidorRtspSimulado({
    usuario: 'servicio',
    clave: 'clave-simulada',
    canales: { 102: 'H264' },
  });
  const hora = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Bogota',
    dateStyle: 'short',
    timeStyle: 'medium',
  })
    .format(new Date())
    .replace(' ', 'T');
  const guion = (familia, extra) =>
    P.equiposSimulados({
      [`${familia}.simulado.invalid`]: {
        familia,
        usuario: 'servicio',
        clave: 'clave-simulada',
        hora: `${hora}-05:00`,
        destino: familia,
        ...extra,
      },
    });
  const peticiones = {
    camara: guion('camara', {}),
    terminal: guion('terminal', { verificacionRemota: true }),
    videoportero: guion('videoportero', {
      aperturaRemota: true,
      canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }],
    }),
  };
  // HTTP al simulado de su familia; RTSP al servidor del bucle local.
  const equipos = FAMILIAS.map(({ familia }) => ({
    familia,
    host: '127.0.0.1',
    usuario: 'servicio',
    clave: 'clave-simulada',
    puerta: 1,
    canalDeVideo: '102',
    puertoRtsp: rtsp.puerto,
    peticion: async (u, o) => {
      const url = new URL(String(u));
      url.hostname = `${familia}.simulado.invalid`;
      return peticiones[familia](url, o);
    },
  }));
  return { equipos, cerrar: () => rtsp.cerrar() };
};

/** La persona delante del equipo. Sin terminal no hay nadie: `null`. */
const persona = () => {
  const hayTerminal = process.stdin.isTTY === true;
  const preguntar = async (texto) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await rl.question(texto);
    } finally {
      rl.close();
    }
  };
  return {
    indicar: async (texto) => {
      decir(`     ▶ ${texto}`);
      if (hayTerminal) await preguntar('       (Enter cuando esté listo) ');
    },
    confirmar: async (pregunta) => {
      if (!hayTerminal) {
        decir(`     ? ${pregunta} — sin nadie que conteste`);
        return null;
      }
      const r = (await preguntar(`     ? ${pregunta} (s/n) `)).trim();
      return /^s/i.test(r) ? true : /^n/i.test(r) ? false : null;
    },
  };
};

/** En `--simulado`, quien mira contesta lo que el simulado accionó. */
const personaSimulada = () => {
  let antes = 0;
  let destino = '';
  return (familia) => ({
    indicar: async (texto) => {
      destino = familia;
      antes = P.aperturasFisicasPor.get(destino) ?? 0;
      decir(`     ▶ ${texto}`);
    },
    confirmar: async (pregunta) => {
      const r = /pitido/.test(pregunta) ? true : (P.aperturasFisicasPor.get(destino) ?? 0) > antes;
      decir(`     ? ${pregunta} — ${r ? 'sí' : 'no'} (simulado)`);
      return r;
    },
  });
};

// ── LAS COMPROBACIONES DEL MAC ────────────────────────────────────────────────
const comprobaciones = async (pool) => {
  decir('── Comprobaciones del Mac');
  const puerto = process.env.PORT || '3000';
  const ip = ipDelMac();
  const local = await sondearSalud(`http://127.0.0.1:${puerto}/health`);
  decir(
    local.ok
      ? `  ✓ API en marcha: http://127.0.0.1:${puerto}/health`
      : `  ✗ la API no contesta en http://127.0.0.1:${puerto}/health (${local.motivo ?? `HTTP ${local.estado}`})` +
          ' → arránquela: pnpm --filter @ncr/api start',
  );
  if (ip === null) {
    decir('  ✗ el Mac no tiene IP en ninguna red → conéctelo a la Wi-Fi o al cable de los equipos');
  } else {
    const porIp = await sondearSalud(`http://${ip}:${puerto}/health`);
    decir(
      porIp.ok
        ? `  ✓ la API contesta por la IP del Mac: http://${ip}:${puerto}/health`
        : local.ok
          ? `  ✗ la API contesta en el Mac pero NO por su IP (${ip}): cortafuegos del Mac → ` +
            'Ajustes del Sistema → Red → Cortafuegos → permitir conexiones entrantes de «node»'
          : `  ✗ tampoco por la IP del Mac (${ip})`,
    );
    decir(
      `  ▶ iPhone: datos móviles apagados, misma Wi-Fi, y en Safari abra http://${ip}:${puerto}/health`,
    );
    decir(
      '    Si Safari no la abre, el problema es la red, no la app (docs/guias/APP_EN_IPHONE.md §1)',
    );
  }
  const go2rtc = process.env.GO2RTC_URL ?? '';
  if (go2rtc === '') {
    decir('  ✗ GO2RTC_URL vacía: sin video en vivo → GO2RTC_URL=http://127.0.0.1:1984');
  } else {
    const g = await sondearSalud(`${go2rtc.replace(/\/$/, '')}/api`);
    decir(
      g.alcanzada
        ? '  ✓ puente de video (go2rtc) en marcha'
        : '  ✗ go2rtc no contesta → pnpm sitio:video',
    );
  }
  if (pool === null) {
    decir('  · sin DATABASE_URL: no se comprueban migraciones ni eventos de la plataforma');
    return;
  }
  try {
    const pendientes = await migracionesPendientes(pool, join(RAIZ, 'supabase/migrations'));
    decir(
      pendientes === null
        ? '  · la base no lleva el registro de migraciones de la CLI: compruébelo con supabase migration list'
        : pendientes.length === 0
          ? '  ✓ la base tiene todas las migraciones del repositorio'
          : `  ✗ faltan ${pendientes.length} migraciones → supabase db push (${pendientes.join(', ')})`,
    );
  } catch (error) {
    decir(`  ✗ no se pudo leer la base: ${error.message}`);
  }
};

// ── J2 · RESPALDO Y REVERSIÓN ─────────────────────────────────────────────────
const respaldar = async (equipos, carpeta) => {
  mkdirSync(carpeta, { recursive: true, mode: 0o700 });
  let fallos = 0;
  for (const e of equipos) {
    try {
      const r = await P.capturarRespaldo(e, new Date());
      const fichero = join(carpeta, `${e.familia}.json`);
      writeFileSync(fichero, `${JSON.stringify(r, null, 2)}\n`, { mode: 0o600 });
      chmodSync(fichero, 0o600);
      decir(`  ✓ ${e.familia}: ${r.documentos.length} documentos → ${fichero}`);
      for (const d of r.documentos.filter((x) => x.nota !== null))
        decir(`     · ${d.clave}: ${d.nota}`);
    } catch (error) {
      fallos += 1;
      decir(`  ✗ ${e.familia}: ${error.message}`);
    }
  }
  return fallos;
};

const restaurar = async (equipos, carpeta) => {
  let fallos = 0;
  for (const e of equipos) {
    const fichero = join(carpeta, `${e.familia}.json`);
    if (!existsSync(fichero)) {
      decir(`  · ${e.familia}: no hay respaldo en ${fichero}`);
      continue;
    }
    const resultados = await P.restaurarRespaldo(e, JSON.parse(readFileSync(fichero, 'utf8')));
    for (const r of resultados) {
      if (r.estado === 'fallo') fallos += 1;
      const signo = { igual: '✓', restaurado: '✓', fallo: '✗', no_restaurable: '⚠' }[r.estado];
      decir(`  ${signo} ${e.familia} · ${r.clave}: ${r.estado} — ${r.detalle}`);
    }
  }
  return fallos;
};

// ── EL ENSAYO ────────────────────────────────────────────────────────────────
const principal = async () => {
  decir(
    `pnpm sitio:ensayo · ${new Date().toISOString()}${simulado ? ' · SIMULADO: no vale como verificación' : ''}`,
  );
  const sim = simulado ? await simulados() : null;
  const equipos = (
    sim === null ? FAMILIAS.map(desdeEntorno).filter((e) => e !== null) : sim.equipos
  ).filter((e) => pedidas.includes(e.familia));
  if (equipos.length === 0)
    salir('ningún equipo declarado en el .env (BARRERA_*, TERMINAL_*, VIDEOPORTERO_*)');

  const capturar = valor('capturar');
  const restaurarDe = valor('restaurar');
  if (capturar !== null || restaurarDe !== null) {
    const carpeta = fueraDelRepo(capturar ?? restaurarDe, 'el respaldo');
    decir(
      capturar !== null
        ? `── Respaldo de la configuración en ${carpeta}`
        : `── Reversión desde ${carpeta}`,
    );
    const fallos =
      capturar !== null ? await respaldar(equipos, carpeta) : await restaurar(equipos, carpeta);
    await sim?.cerrar();
    process.exit(fallos > 0 ? 1 : 0);
  }

  let pool = null;
  if (!simulado && (process.env.DATABASE_URL ?? '') !== '' && !bandera('sin-plataforma')) {
    const { Pool } = createRequire(join(RAIZ, 'apps/api/package.json'))('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  }
  if (!simulado) await comprobaciones(pool);

  const plataforma = simulado
    ? { primeroDesde: async () => ({ titulo: 'Evento simulado', ocurridoEn: new Date() }) }
    : pool === null
      ? undefined
      : eventosDeLaPlataforma(pool);
  const foto = valor('foto') === null ? undefined : readFileSync(resolve(valor('foto')));
  const interlocutorDe = simulado ? personaSimulada() : () => persona();
  const informes = [];
  const ROTULO = {
    camara: 'Cámara LPR',
    terminal: 'Terminal facial',
    videoportero: 'Videoportero',
  };
  for (const equipo of equipos) {
    decir('');
    decir(`▷ ${ROTULO[equipo.familia]}: ensayando…`);
    if (pool !== null) {
      const alta = await equipoRegistrado(pool, equipo.host).catch(() => []);
      if (alta.length === 0) decir('  ⚠ este equipo no está registrado en la consola con esta IP');
    }
    const informe = await P.ensayarEquipo({
      equipo,
      interlocutor: interlocutorDe(equipo.familia),
      soloLectura: bandera('solo-lectura'),
      ...(plataforma === undefined ? {} : { plataforma }),
      ...(foto === undefined ? {} : { foto }),
      esperaDeEventoMs: numero(valor('espera'), 60) * 1000,
      limitesDeFoto: {
        bytesMaximos: numero(process.env.EQUIPOS_FOTO_KB_MAXIMOS, 200) * 1024,
        ladoMaximo: numero(process.env.EQUIPOS_FOTO_LADO_MAXIMO, 1024),
      },
      zona: process.env.EQUIPOS_ZONA_HORARIA || 'America/Bogota',
      ahora: () => new Date(),
    });
    informes.push(informe);
    for (const l of P.lineasDelInforme(informe, SECRETOS)) decir(l);
  }
  await pool?.end();
  await sim?.cerrar();

  const r = P.recuentoDe(informes);
  decir('');
  decir(
    `VEREDICTO: ${r.fallo === 0 ? 'SIN FALLOS' : 'CON FALLOS'} · ${r.ok} OK · ${r.fallo} FALLO · ` +
      `${r.omitido} omitidos · ${r.no_aplica} no aplica`,
  );
  const destino = valor('informe');
  if (destino !== null) {
    const ruta = fueraDelRepo(destino, 'el informe');
    writeFileSync(ruta, `# Ensayo en sitio\n\n\`\`\`\n${salida.join('\n')}\n\`\`\`\n`, {
      mode: 0o600,
    });
    console.log(`informe: ${ruta}`);
  }
  process.exit(r.fallo === 0 ? 0 : 1);
};

await principal();
