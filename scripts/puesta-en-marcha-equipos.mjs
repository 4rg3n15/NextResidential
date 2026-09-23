#!/usr/bin/env node
/**
 * PUESTA EN MARCHA EN SITIO · un solo comando, delante de los equipos.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ NO SE LLAMA COMO EL FABRICANTE
 *
 * Porque KPI-11 no admite su nombre fuera de `packages/providers`, y el control
 * lo rechazó en cuanto este fichero se llamó así. No es una molestia del
 * control: es la misma regla que hace que la ETAPA 15 pueda sustituir un
 * adaptador sin tocar nada más. Un guion de operación que lleva el nombre del
 * fabricante en su ruta es una referencia al fabricante en el resto del
 * sistema, y dentro de seis meses alguien la citaría en un flujo de CI.
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
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --sin-accionar
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
const { RUTAS, ClienteDeEquipo, interpretarError, juzgarModo, leerCtrlMod } = createRequire(
  import.meta.url,
)(compilado);

const argumentos = process.argv.slice(2);
const sinAccionar = argumentos.includes('--sin-accionar');
const destinoInforme =
  argumentos.find((a) => a.startsWith('--informe='))?.slice('--informe='.length) ??
  join(process.env.TMPDIR ?? '/tmp', 'puesta-en-marcha-equipos.md');

/** Las tres familias, con el prefijo de sus variables. */
const FAMILIAS = [
  { familia: 'camara', prefijo: 'BARRERA', rotulo: 'Cámara LPR y barrera' },
  { familia: 'terminal', prefijo: 'TERMINAL', rotulo: 'Terminal facial' },
  { familia: 'videoportero', prefijo: 'VIDEOPORTERO', rotulo: 'Videoportero' },
];

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ESTE GUION NO CONOCE NI UNA RUTA NI UN CUERPO
 *
 * Las dos cosas las declara el catálogo de `@ncr/providers`, con su procedencia
 * al lado, y aquí sólo se leen sus banderas: `acciona` mueve algo físico y
 * `dejaRastro` cambia el estado del equipo o se lo quita a otro.
 *
 * No es purismo: lo destapó **KPI-11** en cuanto este fichero escribió por su
 * cuenta el XML de la barrera. Un guion de operación no tiene por qué saber
 * cómo se llama el campo de modo de una talanquera, y si lo supiera, el día que
 * la captura real lo cambie habría dos sitios que corregir y uno se olvidaría.
 */

const NO_SOPORTADO = /notSupport|invalidOperation|notSupported/i;

/** El propósito de la ruta que decide quién manda. Se trata aparte. */
const PROPOSITO_DEL_MODO = 'leer quién controla la barrera: la cámara o la plataforma';

/**
 * Orden de sondeo: **primero lo que menos respaldo tiene**.
 *
 * Una ruta VERIFICADA ya se probó contra este firmware; una respaldada por la
 * guía oficial tiene documento detrás; una deducida no tiene ninguna de las
 * dos. Sondearlas en ese orden inverso pone las sorpresas al principio, que es
 * cuando queda tiempo para reaccionar.
 */
const PESO = { documentada: 0, guia_oficial: 1, verificada: 2 };

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
  const cuerpo = ruta.cuerpo;
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
      // El mapa de errores traduce el código del fabricante a lo que hay que
      // HACER, que es lo único accionable delante del equipo.
      return {
        veredicto: 'desmentida',
        detalle: interpretarError(respuesta.cuerpo).detalle,
        ms: respuesta.latenciaMs,
      };
    }
    if (!respuesta.ok) {
      const error = interpretarError(respuesta.cuerpo);
      return {
        veredicto: error.reaccion === 'credencial_rechazada' ? 'credenciales' : 'desmentida',
        detalle: `HTTP ${respuesta.estado} · ${error.detalle}`,
        ms: respuesta.latenciaMs,
      };
    }
    return {
      veredicto: 'confirmada',
      detalle: `HTTP ${respuesta.estado}`,
      ms: respuesta.latenciaMs,
      cuerpo: respuesta.cuerpo,
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

  const aplicables = RUTAS.filter(
    (r) => r.familia === entrada.familia || r.familia === 'comun',
  ).sort((a, b) => (PESO[a.procedencia] ?? 0) - (PESO[b.procedencia] ?? 0));

  for (const ruta of aplicables) {
    const omitida = ruta.dejaRastro === true || (sinAccionar && ruta.acciona === true);
    if (omitida) {
      const motivo =
        ruta.dejaRastro === true
          ? 'cambia el estado del equipo: se prueba a mano, con la guía delante'
          : 'acciona un relé; se pidió no accionar';
      anotar(`   ${ICONO.omitida} ${ruta.proposito} — OMITIDA (${motivo})`);
      continue;
    }

    const { veredicto, detalle, ms, cuerpo } = await sondear(cliente, ruta);
    const tiempo = ms === null ? '' : ` · ${Math.round(ms)} ms`;
    const etiqueta =
      ruta.procedencia === 'verificada'
        ? '[VERIFICADA]'
        : ruta.procedencia === 'guia_oficial'
          ? '[guía oficial]'
          : '[deducida]';
    anotar(
      `   ${ICONO[veredicto]} ${ruta.proposito} ${etiqueta} — ${veredicto}: ${detalle}${tiempo}`,
    );

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * `ctrlMod` · AQUÍ NO BASTA CON QUE LA RUTA RESPONDA
     *
     * Todas las demás se sondean para saber si EXISTEN. Ésta, para saber QUÉ
     * CONTESTA: con 0 o 2 la cámara abre por su cuenta, el motor de reglas
     * queda decorativo y el sistema no puede operar contra ese equipo. Un
     * «confirmada» a secas aquí sería el peor de los falsos verdes.
     */
    if (ruta.proposito === PROPOSITO_DEL_MODO && veredicto === 'confirmada') {
      const modo = juzgarModo(leerCtrlMod(cuerpo ?? ''));
      if (modo.admisible) {
        anotar(`       ✓ quien manda: LA PLATAFORMA (ctrlMod = ${modo.valorLeido})`);
      } else {
        huboProblema = true;
        anotar('       ✗ HALLAZGO DE BLOQUEO · el equipo NO opera bajo control de la plataforma');
        anotar(`         ${modo.detalle}`);
        anotar('         Cámbielo en la configuración del equipo (guía §8.2) y repita.');
      }
    }

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
    if (ruta.acciona === true && veredicto === 'confirmada' && ms !== null && ms > 3000) {
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
