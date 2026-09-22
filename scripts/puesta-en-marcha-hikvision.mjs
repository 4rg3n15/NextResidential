#!/usr/bin/env node
/**
 * PUESTA EN MARCHA EN SITIO · un solo comando, delante de los equipos.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ HACE, EN ESTE ORDEN
 *
 *  1 · Acredita contra cada equipo y lee su identidad. Si esto falla, lo demás
 *      sobra, y se dice en el minuto uno y no en el cincuenta.
 *  2 · **Confirma o desmiente cada ruta DOCUMENTADA, NO VERIFICADA.** Es el
 *      trabajo principal: once de las doce rutas del catálogo salen de la guía
 *      del fabricante y ninguna se ha probado contra ESTOS aparatos.
 *  3 · Acciona cada relé y **mide la latencia** (KPI-13 · < 3 s).
 *  4 · Escribe un informe con lo que contestó cada equipo, ruta por ruta.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * LO QUE NO HACE, Y ES DELIBERADO
 *
 * **No configura nada.** No apaga la apertura por lista local de la cámara, no
 * cambia el modo de la terminal y no habilita el canal de audio. Esos tres
 * cambios los hace el usuario en la interfaz de cada equipo, con el estado
 * previo anotado para poder revertirlo, y están en
 * `docs/guias/VALIDACION_HIKVISION_EN_SITIO.md` §8. Un guion que cambiara la
 * configuración de un equipo de acceso sin que nadie lo viera es exactamente lo
 * que no debe existir.
 *
 * **No escribe ninguna dirección ni credencial en el repositorio.** Todo llega
 * por entorno; el informe sale a la ruta que se le indique, fuera del árbol por
 * omisión, y **elide** host y usuario.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * USO
 *
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-hikvision.mjs
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-hikvision.mjs --sin-accionar
 *
 * Variables, por equipo (las tres familias son opcionales: se prueba lo que
 * esté declarado):
 *
 *   BARRERA_HOST / BARRERA_PUERTO / BARRERA_USUARIO / BARRERA_CLAVE
 *   TERMINAL_HOST / TERMINAL_PUERTO / TERMINAL_USUARIO / TERMINAL_CLAVE
 *   VIDEOPORTERO_HOST / VIDEOPORTERO_PUERTO / VIDEOPORTERO_USUARIO / VIDEOPORTERO_CLAVE
 *
 * Códigos de salida: 0 todo confirmado · 1 alguna ruta desmentida o algún relé
 * sin responder · 2 configuración incompleta.
 */
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const compilado = join(raiz, 'packages/providers/dist/index.js');
if (!existsSync(compilado)) {
  console.error('FALTA la compilación de @ncr/providers. Ejecute antes:');
  console.error('  pnpm --filter @ncr/providers build');
  process.exit(2);
}
const { RUTAS, ClienteDeEquipo } = createRequire(import.meta.url)(compilado);

const argumentos = process.argv.slice(2);
const sinAccionar = argumentos.includes('--sin-accionar');
const destinoInforme =
  argumentos.find((a) => a.startsWith('--informe='))?.slice('--informe='.length) ??
  join(process.env.TMPDIR ?? '/tmp', 'puesta-en-marcha-hikvision.md');

/** Las tres familias, con el prefijo de sus variables. */
const FAMILIAS = [
  { familia: 'camara', prefijo: 'BARRERA', rotulo: 'Cámara LPR y barrera' },
  { familia: 'terminal', prefijo: 'TERMINAL', rotulo: 'Terminal facial' },
  { familia: 'videoportero', prefijo: 'VIDEOPORTERO', rotulo: 'Videoportero' },
];

/**
 * Rutas que **accionan algo físico**. Se saltan con `--sin-accionar`, porque
 * una barrera que se abre sola mientras alguien está delante no es una prueba,
 * es un susto.
 */
const ACCIONAN = new Set([
  'accionar la barrera vehicular',
  'abrir la puerta desde la plataforma',
  'abrir la puerta del videoportero',
]);

/**
 * Rutas que **cambian el estado del equipo** y no se prueban nunca desde aquí:
 * dar de alta o suprimir una plantilla deja rastro en el aparato, y abrir el
 * canal de audio se lo quita a quien esté hablando.
 */
const NO_SE_SONDEAN = new Set([
  'dar de alta la persona a la que pertenece la plantilla',
  'dar de baja a la persona y con ella su plantilla',
  'cargar la plantilla facial',
  'suprimir la plantilla facial',
  'abrir el canal de audio bidireccional',
  'cerrar el canal de audio bidireccional',
  'escuchar los eventos que el equipo emite',
]);

const CUERPOS = {
  'accionar la barrera vehicular': {
    tipo: 'application/xml',
    contenido:
      '<?xml version="1.0" encoding="UTF-8"?><BarrierGate><ctrlMode>open</ctrlMode></BarrierGate>',
  },
  'abrir la puerta desde la plataforma': {
    tipo: 'application/xml',
    contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
  },
  'abrir la puerta del videoportero': {
    tipo: 'application/xml',
    contenido: '<RemoteControlDoor><cmd>open</cmd></RemoteControlDoor>',
  },
};

const NO_SOPORTADO = /notSupport|invalidOperation|notSupported/i;

/** Nunca sale el host completo a un fichero que alguien puede adjuntar. */
const elidir = (texto) => {
  if (typeof texto !== 'string' || texto.length <= 4) return '****';
  return `${texto.slice(0, 2)}…${texto.slice(-2)}`;
};

const configuracionDe = ({ prefijo }) => {
  const host = (process.env[`${prefijo}_HOST`] ?? '').trim();
  const usuario = (process.env[`${prefijo}_USUARIO`] ?? '').trim();
  const clave = (process.env[`${prefijo}_CLAVE`] ?? '').trim();
  if (host === '' && usuario === '' && clave === '') return null;
  const faltan = [
    host === '' ? `${prefijo}_HOST` : null,
    usuario === '' ? `${prefijo}_USUARIO` : null,
    clave === '' ? `${prefijo}_CLAVE` : null,
  ].filter((x) => x !== null);
  if (faltan.length > 0) return { faltan };
  const puerto = Number(process.env[`${prefijo}_PUERTO`] ?? '80');
  return { host, usuario, clave, puerto: Number.isInteger(puerto) && puerto > 0 ? puerto : 80 };
};

/** Un sondeo, con su veredicto ya interpretado. */
const sondear = async (cliente, ruta) => {
  const cuerpo = CUERPOS[ruta.proposito];
  try {
    const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta, cuerpo);
    if (respuesta.estado === 401) {
      return {
        veredicto: 'credenciales',
        detalle: 'el equipo rechazó las credenciales',
        ms: respuesta.latenciaMs,
      };
    }
    if (respuesta.estado === 404) {
      return {
        veredicto: 'desmentida',
        detalle: 'HTTP 404: la ruta no existe en este firmware',
        ms: respuesta.latenciaMs,
      };
    }
    if (NO_SOPORTADO.test(respuesta.cuerpo)) {
      return {
        veredicto: 'desmentida',
        detalle: 'el equipo contestó notSupport',
        ms: respuesta.latenciaMs,
      };
    }
    if (!respuesta.ok) {
      return {
        veredicto: 'desmentida',
        detalle: `HTTP ${respuesta.estado}`,
        ms: respuesta.latenciaMs,
      };
    }
    return {
      veredicto: 'confirmada',
      detalle: `HTTP ${respuesta.estado}`,
      ms: respuesta.latenciaMs,
    };
  } catch (error) {
    return {
      veredicto: 'inalcanzable',
      detalle: error?.detalle ?? String(error?.message ?? error),
      ms: error?.latenciaMs ?? null,
    };
  }
};

const ICONO = {
  confirmada: '✓',
  desmentida: '✗',
  inalcanzable: '⚠',
  credenciales: '⚠',
  omitida: '·',
};

const lineas = [];
const anotar = (texto) => {
  console.log(texto);
  lineas.push(texto);
};

let huboProblema = false;
let algunEquipo = false;

anotar('PUESTA EN MARCHA · Next Control Residencial contra los equipos');
anotar('');
anotar(`Fecha: ${new Date().toISOString()}`);
anotar(`Accionamiento de relés: ${sinAccionar ? 'OMITIDO (--sin-accionar)' : 'SÍ'}`);
anotar('');

for (const entrada of FAMILIAS) {
  const config = configuracionDe(entrada);
  if (config === null) {
    anotar(`── ${entrada.rotulo} · NO DECLARADO (sin ${entrada.prefijo}_HOST). Se omite.`);
    anotar('');
    continue;
  }
  if (config.faltan !== undefined) {
    anotar(`── ${entrada.rotulo} · CONFIGURACIÓN A MEDIAS: faltan ${config.faltan.join(', ')}`);
    anotar('');
    huboProblema = true;
    continue;
  }

  algunEquipo = true;
  anotar(`── ${entrada.rotulo} · ${elidir(config.host)}:${config.puerto}`);

  const cliente = new ClienteDeEquipo({
    host: config.host,
    puerto: config.puerto,
    usuario: config.usuario,
    clave: config.clave,
    tiempoLimiteMs: 6000,
  });

  const aplicables = RUTAS.filter((r) => r.familia === entrada.familia || r.familia === 'comun');

  for (const ruta of aplicables) {
    const omitida =
      NO_SE_SONDEAN.has(ruta.proposito) || (sinAccionar && ACCIONAN.has(ruta.proposito));
    if (omitida) {
      const motivo = NO_SE_SONDEAN.has(ruta.proposito)
        ? 'cambia el estado del equipo: se prueba a mano, con la guía delante'
        : 'acciona un relé; se pidió no accionar';
      anotar(`   ${ICONO.omitida} ${ruta.proposito} — OMITIDA (${motivo})`);
      continue;
    }

    const { veredicto, detalle, ms } = await sondear(cliente, ruta);
    const tiempo = ms === null ? '' : ` · ${Math.round(ms)} ms`;
    const etiqueta = ruta.procedencia === 'verificada' ? '[VERIFICADA]' : '[documentada]';
    anotar(
      `   ${ICONO[veredicto]} ${ruta.proposito} ${etiqueta} — ${veredicto}: ${detalle}${tiempo}`,
    );

    if (veredicto !== 'confirmada') {
      huboProblema = true;
      anotar(`       ruta: ${ruta.metodo} ${ruta.ruta}`);
      if (ruta.confirmarEnSitio !== undefined) {
        anotar(`       qué había que confirmar: ${ruta.confirmarEnSitio}`);
      }
      anotar(
        '       NO pruebe otra ruta por parecido: captúrela del equipo y corríjala en ' +
          'packages/providers/src/equipo/catalogo-de-rutas.ts',
      );
    }

    // KPI-13 · el accionamiento tiene umbral, y es el único que lo tiene.
    if (ACCIONAN.has(ruta.proposito) && veredicto === 'confirmada' && ms !== null && ms > 3000) {
      huboProblema = true;
      anotar(`       ⚠ KPI-13: ${Math.round(ms)} ms supera el umbral de 3000 ms`);
    }
  }
  anotar('');
}

if (!algunEquipo && !huboProblema) {
  anotar('No había ningún equipo declarado. Defina al menos BARRERA_HOST y repita.');
  huboProblema = true;
}

anotar('');
anotar(
  huboProblema
    ? 'VEREDICTO: hay rutas desmentidas, equipos inalcanzables o latencias fuera de umbral.'
    : 'VEREDICTO: todas las rutas sondeadas quedan CONFIRMADAS contra estos equipos.',
);
anotar('');
anotar('Lo que este guion NO hizo, y le toca a usted (guía §8):');
anotar('  · cámara: desactivar la apertura por lista local y apuntar la subida HTTP;');
anotar('  · terminal facial: determinar si admite reportar SIN abrir;');
anotar('  · videoportero: habilitar el canal de audio bidireccional.');
anotar('Anote el estado PREVIO de cada ajuste antes de tocarlo.');

try {
  const cuerpo = `# Puesta en marcha en sitio\n\n\`\`\`\n${lineas.join('\n')}\n\`\`\`\n`;
  writeFileSync(resolve(destinoInforme), cuerpo, 'utf8');
  console.log('');
  console.log(`Informe escrito en ${resolve(destinoInforme)}`);
  console.log('Host y usuario salen ELIDIDOS: el informe se puede adjuntar.');
} catch (error) {
  console.error(`No se pudo escribir el informe: ${String(error?.message ?? error)}`);
}

process.exit(huboProblema ? 1 : 0);
