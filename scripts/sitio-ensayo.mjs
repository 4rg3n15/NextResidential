#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * pnpm sitio:ensayo · ETAPA 15-L (J1, J2) · EL ENSAYO DEL DÍA DE ENTREGA
 *
 * Recorre, equipo por equipo y en este orden, las nueve capacidades:
 *   1 conexión y Digest · 2 hora frente al Mac · 3 configuración · 4 eventos
 *   (la cámara: ¿publica en ESTE Mac?) · 5 apertura (con alguien mirando) ·
 *   6 alta, espera y baja de un rostro (terminal y videoportero con biblioteca)
 *   · 7 video (sonda RTSP y, con GO2RTC_URL en el .env, negociación WebRTC real
 *     contra go2rtc: registro por PATCH y POST /api/webrtc, sin credencial en la
 *     salida) · 8 audio · 9 tiempo de la verificación remota (terminal: cinco
 *   presentaciones, p50/p95 contra su plazo)
 * y dice OK/FALLO por paso, con la causa y la acción. Antes, las comprobaciones
 * del Mac —la API por el bucle local y POR LA IP DEL MAC (la del iPhone), el
 * puente de video, las migraciones— y las de la PLATAFORMA, que cuentan en el
 * veredicto: el proveedor de equipos (F3) y la conexión de pg-boss (C1).
 *
 *   pnpm sitio:ensayo                               # los equipos del .env
 *   pnpm sitio:ensayo -- --solo-lectura             # nada que mueva o escriba
 *   pnpm sitio:ensayo -- --equipo=terminal --foto=$HOME/ncr-sitio/cara.jpg
 *   pnpm sitio:ensayo -- --capturar=$HOME/ncr-sitio/respaldo   # J2, y sale
 *   pnpm sitio:ensayo -- --restaurar=$HOME/ncr-sitio/respaldo  # J2, y sale
 *   pnpm sitio:ensayo -- --simulado                 # sin red: equipos simulados
 *   otras: --espera=<s> (60) · --espera-sincronizacion=<s> (60; en --simulado,
 *   0,2 s) · --sin-plataforma · --informe=<ruta.md> · --env=<ruta>
 *
 * C6 (15-M) · LOS EQUIPOS SALEN DEL REGISTRO DE LA CONSOLA: con la base al
 * alcance (DATABASE_URL) y EQUIPOS_LLAVE, se ensaya UN paso por cada equipo
 * activo de `dispositivos` con usuario y credencial —N cámaras, N terminales,
 * N videoporteros, con cualquier IP— con la credencial descifrada por la misma
 * bóveda que usa la API. Las variables BARRERA_*, TERMINAL_* y VIDEOPORTERO_*
 * quedan de RESPALDO: sólo si la base no está o el registro no tiene equipos.
 * `--equipo=<familia|nombre>` filtra por familia o por el nombre de la ficha.
 *
 * Lee `apps/api/.env` —el mismo de la API—: BARRERA_*, TERMINAL_*,
 * VIDEOPORTERO_* (HOST, PUERTO, USUARIO, CLAVE, CANAL, CANAL_VIDEO), PORT,
 * ALARM_SERVER_EQUIPOS, ALARM_SERVER_IP_ANUNCIADA, TERMINAL_PLAZO_DE_VERIFICACION_S,
 * PROVEEDOR_DE_EQUIPOS, EQUIPOS_LLAVE y las cadenas de la base. NUNCA imprime una credencial:
 * toda línea pasa por el tachado de los valores secretos del `.env` (también
 * los secretos de ruta de ALARM_SERVER_EQUIPOS). Informes y respaldos, sólo
 * FUERA del repositorio.
 *
 * Salida: 0 sin fallos · 1 algún FALLO · 2 configuración incompleta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ipDelMacHacia } from './lib/red-del-mac.mjs';
import {
  equipoRegistrado,
  eventosDeLaPlataforma,
  verificacionesDeLaPlataforma,
} from './lib/ensayo-plataforma.mjs';
import { elegirEquipos, numero } from './lib/equipos-del-ensayo.mjs';
import {
  comprobacionesDeLaPlataforma,
  comprobacionesDelMac,
} from './lib/comprobaciones-del-mac.mjs';
import { respaldar, restaurar } from './lib/respaldo-en-sitio.mjs';

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

/**
 * C2 · los secretos de ruta del servidor de alarma: `copropiedad|dispositivo|
 * secreto|ip[,ip]` y `;` entre equipos. Se comparan con la ruta de la cámara y
 * se tachan de toda salida.
 */
const SECRETOS_DE_ALARMA = (process.env.ALARM_SERVER_EQUIPOS ?? '')
  .split(';')
  .map((e) => e.split('|')[2]?.trim() ?? '')
  .filter((s) => s !== '');
/** Los valores del .env que nunca deben salir por pantalla ni al informe. */
const SECRETOS = Object.entries(process.env)
  .filter(([k]) => /CLAVE|PASSWORD|SECRET|LLAVE|TOKEN|_KEY$|USUARIO/.test(k))
  .map(([, v]) => v ?? '')
  .concat(
    [process.env.DATABASE_URL, process.env.PGBOSS_DATABASE_URL]
      .map((u) => /\/\/[^:]+:([^@]+)@/.exec(u ?? '')?.[1] ?? '')
      .filter((x) => x !== ''),
    SECRETOS_DE_ALARMA,
  );
const salida = [];
const decir = (linea = '') => {
  const limpia = P.sinSecretosConocidos(linea, SECRETOS);
  salida.push(limpia);
  console.log(limpia);
};

const pedidas = (valor('equipo') ?? 'camara,terminal,videoportero').split(',');
/** C6 · `--equipo=` admite la familia (camara) o el nombre de la ficha (Entrada norte). */
const pedido = (e) =>
  pedidas.includes(e.familia) || (e.nombre !== undefined && pedidas.includes(e.nombre));

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

// ── EL ENSAYO ────────────────────────────────────────────────────────────────
const principal = async () => {
  decir(
    `pnpm sitio:ensayo · ${new Date().toISOString()}${simulado ? ' · SIMULADO: no vale como verificación' : ''}`,
  );
  // En `--simulado`, los tres equipos y la plataforma los monta el paquete.
  const sim = simulado ? await P.montarEnsayoSimulado((l) => decir(l)) : null;
  let pool = null;
  if (!simulado && (process.env.DATABASE_URL ?? '') !== '' && !bandera('sin-plataforma')) {
    const { Pool } = createRequire(join(RAIZ, 'apps/api/package.json'))('pg');
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    pool.on('error', (e) => decir(`   ⚠ la base cortó una conexión (15-O): ${e.message}`));
  }
  // C6 · PRIMERO el registro de la consola (N equipos); el .env sólo de respaldo.
  const elegidos = await elegirEquipos({ sim, pool, entorno: process.env, decir, salir });
  const origenDeLosEquipos = elegidos.origen;
  let equipos = elegidos.equipos;
  equipos = equipos.filter(pedido);
  decir(`Equipos: ${equipos.length} · origen: ${origenDeLosEquipos}`);
  if (equipos.length === 0)
    salir(
      'ningún equipo: dé de alta los equipos en la consola (o declare BARRERA_*, TERMINAL_*, ' +
        'VIDEOPORTERO_* en el .env como respaldo)',
    );

  const capturar = valor('capturar');
  const restaurarDe = valor('restaurar');
  if (capturar !== null || restaurarDe !== null) {
    const carpeta = fueraDelRepo(capturar ?? restaurarDe, 'el respaldo');
    decir(
      capturar !== null
        ? `── Respaldo de la configuración en ${carpeta}`
        : `── Reversión desde ${carpeta}`,
    );
    const fallos = await (capturar !== null ? respaldar : restaurar)({
      P,
      equipos,
      carpeta,
      decir,
      // R2 (15-N) · la zona del conjunto, para AVISAR si el respaldo trae otra.
      zonaDelConjunto: process.env.EQUIPOS_ZONA_HORARIA || 'America/Bogota',
    });
    await sim?.cerrar();
    process.exit(fallos > 0 ? 1 : 0);
  }

  if (!simulado) await comprobacionesDelMac({ pool, decir, raiz: RAIZ });
  // F3 y C1 · cuentan en el veredicto, también en `--simulado` (su API simulada).
  const comprobaciones =
    sim === null
      ? await comprobacionesDeLaPlataforma({ P, entorno: process.env, pool })
      : [
          P.juzgarProveedorDeEquipos(sim.entorno, sim.equiposReales),
          P.juzgarConexionDePgBoss(sim.entorno),
          P.juzgarPresupuestoDeConexiones(sim.entorno),
        ];
  decir(`── Comprobaciones de la plataforma${sim === null ? '' : ' (API simulada)'}`);
  for (const l of P.lineasDeComprobaciones(comprobaciones, SECRETOS)) decir(l);

  const plataforma = sim?.plataforma ?? (pool === null ? undefined : eventosDeLaPlataforma(pool));
  const verificaciones =
    sim?.verificaciones ?? (pool === null ? undefined : verificacionesDeLaPlataforma(pool));
  const foto = valor('foto') === null ? undefined : readFileSync(resolve(valor('foto')));
  const esperaDeSincronizacionMs =
    valor('espera-sincronizacion') !== null
      ? numero(valor('espera-sincronizacion'), 60) * 1000
      : simulado
        ? 200
        : 60_000;
  /**
   * C2 · a dónde debe publicar la cámara: la IP del Mac EN SU RED y el PORT de
   * la API. C6 · con el secreto PROPIO de la cámara (emitido en el alta) además
   * de los declarados en el .env; en `--simulado`, el de cada cámara simulada.
   */
  const receptorDe = (equipo) =>
    sim?.receptorEsperadoDe?.(equipo) ??
    sim?.receptorEsperado ?? {
      direccion: ipDelMacHacia(P.ipHaciaElEquipo, equipo.host),
      puerto: numero(process.env.PORT, 3000),
      secretos: [
        ...SECRETOS_DE_ALARMA,
        ...(typeof equipo.secretoDeAlarmServer === 'string' ? [equipo.secretoDeAlarmServer] : []),
      ],
    };
  // Los secretos propios de las cámaras tampoco salen por pantalla.
  for (const e of equipos)
    if (typeof e.secretoDeAlarmServer === 'string') SECRETOS.push(e.secretoDeAlarmServer);
  const informes = [];
  const ROTULO = {
    camara: 'Cámara LPR',
    terminal: 'Terminal facial',
    videoportero: 'Videoportero',
  };
  for (const equipo of equipos) {
    decir('');
    const nombre = equipo.nombre === undefined ? '' : ` «${equipo.nombre}»`;
    decir(`▷ ${ROTULO[equipo.familia]}${nombre}: ensayando…`);
    if (pool !== null && equipo.dispositivoId === undefined) {
      const alta = await equipoRegistrado(pool, equipo.host).catch(() => []);
      if (alta.length === 0) decir('  ⚠ este equipo no está registrado en la consola con esta IP');
    }
    const informe = await P.ensayarEquipo({
      equipo,
      interlocutor: sim === null ? persona() : sim.interlocutorDe(equipo.familia, equipo),
      soloLectura: bandera('solo-lectura'),
      ...(plataforma === undefined ? {} : { plataforma }),
      ...((sim?.verificacionesDe?.(equipo) ?? verificaciones) === undefined
        ? {}
        : { verificaciones: sim?.verificacionesDe?.(equipo) ?? verificaciones }),
      ...(foto === undefined ? {} : { foto }),
      ...(equipo.familia === 'camara' ? { receptorEsperado: receptorDe(equipo) } : {}),
      // E2/C1 (15-M) · con GO2RTC_URL el paso 7 negocia WebRTC contra el puente real.
      ...(process.env.GO2RTC_URL ? { puente: { url: process.env.GO2RTC_URL } } : {}),
      esperaDeEventoMs: numero(valor('espera'), 60) * 1000,
      esperaDeSincronizacionMs,
      plazoDeVerificacionS: numero(process.env.TERMINAL_PLAZO_DE_VERIFICACION_S, 8),
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

  const r = P.recuentoDe(informes, comprobaciones);
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
