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
 * QUÉ HACE, EN ESTE ORDEN, PARA CADA UNA DE LAS TRES FAMILIAS
 *
 *  1 · Acredita contra el equipo y lee su identidad. Si esto falla, lo demás
 *      sobra, y se dice en el minuto uno y no en el cincuenta.
 *  2 · **Confirma o desmiente cada ruta DOCUMENTADA, NO VERIFICADA.** Es el
 *      trabajo principal: casi todas las rutas del catálogo salen de la guía
 *      del fabricante y ninguna se ha probado contra ESTOS aparatos.
 *  3 · Acciona lo que abre y **mide la latencia**: barrera y puerta de la
 *      terminal (KPI-13 · < 3 s), puerta del videoportero (KPI-32 · < 3 s).
 *  4 · **Diagnostica por familia** (ETAPA 15-D · O4): la ficha de la cámara
 *      dice quién decide por las tres vías; la de la terminal, si espera el
 *      veredicto y si su biblioteca cabe; la del videoportero, si abre desde
 *      la central y si tiene canal de audio. Un BLOQUEO en la ficha es un
 *      problema del guion, no una nota al pie.
 *  5 · Con `--con-audio`, abre y cierra el canal de audio del videoportero y
 *      mide cuánto tarda en abrirse. Es un PROXY de KPI-33 (< 2 s extremo a
 *      extremo): el extremo a extremo exige el navegador del operador y NO se
 *      mide aquí. El informe lo dice con esas palabras.
 *  6 · Escribe un informe con lo que contestó cada equipo, ruta por ruta.
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
 * que no debe existir. (Abrir y cerrar el canal de audio con `--con-audio` no
 * deja configuración cambiada: el canal se cierra explícitamente al terminar.)
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
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --con-audio
 *   node scripts/puesta-en-marcha-equipos.mjs --simulado --con-audio
 *
 * `--simulado` NO habla con ningún aparato: monta los tres equipos simulados de
 * `@ncr/providers` y recorre exactamente el mismo guion. Sirve para ensayar el
 * procedimiento y para que este fichero tenga una ejecución reproducible; el
 * informe que produce queda rotulado SIMULADO y no vale como verificación.
 *
 * Variables, por equipo (las tres familias son opcionales: se prueba lo que
 * esté declarado):
 *
 *   BARRERA_HOST / BARRERA_PUERTO / BARRERA_USUARIO / BARRERA_CLAVE / BARRERA_CANAL
 *   TERMINAL_HOST / TERMINAL_PUERTO / TERMINAL_USUARIO / TERMINAL_CLAVE / TERMINAL_CANAL
 *   VIDEOPORTERO_HOST / VIDEOPORTERO_PUERTO / VIDEOPORTERO_USUARIO / VIDEOPORTERO_CLAVE / VIDEOPORTERO_CANAL
 *
 * `*_CANAL` es el carril de la barrera, la puerta de la terminal o el canal de
 * audio del videoportero; por omisión, el carril VERIFICADO de la cámara (1).
 *
 * Códigos de salida: 0 todo confirmado · 1 alguna ruta desmentida, algún relé
 * sin responder, un bloqueo en la ficha o una latencia fuera de umbral · 2
 * configuración incompleta.
 */
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * ETAPA 15-D · la entrada de OPERACIÓN del paquete, no su barril (D-114). El
 * barril es la API pública para la aplicación y la 15-C lo dejó mínimo a
 * propósito: sin catálogo, sin cliente, sin jueces. Este guion es el único que
 * los necesita, y los recibe por una entrada propia.
 */
const compilado = join(raiz, 'packages/providers/dist/operacion.js');
if (!existsSync(compilado)) {
  console.error('FALTA la compilación de @ncr/providers. Ejecute antes:');
  console.error('  pnpm --filter @ncr/providers build');
  process.exit(2);
}
const {
  RUTAS,
  ClienteDeEquipo,
  CARRIL_VERIFICADO_DE_LA_CAMARA,
  diagnosticarEquipo,
  equiposSimulados,
  exigeCanal,
  fichaDe,
  interpretarError,
  juzgarModo,
  leerCtrlMod,
  rutaPara,
} = createRequire(import.meta.url)(compilado);

const argumentos = process.argv.slice(2);
const sinAccionar = argumentos.includes('--sin-accionar');
const conAudio = argumentos.includes('--con-audio');
const simulado = argumentos.includes('--simulado');
const destinoInforme =
  argumentos.find((a) => a.startsWith('--informe='))?.slice('--informe='.length) ??
  join(process.env.TMPDIR ?? '/tmp', 'puesta-en-marcha-equipos.md');

/** Las tres familias, con el prefijo de sus variables y el KPI de su accionamiento. */
const FAMILIAS = [
  { familia: 'camara', prefijo: 'BARRERA', rotulo: 'Cámara LPR y barrera', kpi: 'KPI-13' },
  { familia: 'terminal', prefijo: 'TERMINAL', rotulo: 'Terminal facial', kpi: 'KPI-13' },
  { familia: 'videoportero', prefijo: 'VIDEOPORTERO', rotulo: 'Videoportero', kpi: 'KPI-32' },
];

/** Umbrales comprometidos, en milisegundos. */
const UMBRAL_DE_ACCIONAMIENTO_MS = 3000; // KPI-13 y KPI-32
const UMBRAL_DE_AUDIO_MS = 2000; // KPI-33 (aquí, sólo la apertura del canal: proxy)

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ESTE GUION NO CONOCE NI UNA RUTA NI UN CUERPO
 *
 * Las dos cosas las declara el catálogo de `@ncr/providers`, con su procedencia
 * al lado, y aquí sólo se leen sus banderas: `acciona` mueve algo físico y
 * `dejaRastro` cambia el estado del equipo o se lo quita a otro. Las rutas con
 * canal se resuelven con el canal declarado por entorno, por `rutaPara`; el
 * guion no sabe cómo se escribe el marcador.
 */

const NO_SOPORTADO = /notSupport|invalidOperation|notSupported/i;

/** El propósito de la ruta que decide quién manda en la cámara. Se trata aparte. */
const PROPOSITO_DEL_MODO = 'leer quién controla la barrera: la cámara o la plataforma';
const PROPOSITO_ABRIR_AUDIO = 'abrir el canal de audio bidireccional';
const PROPOSITO_CERRAR_AUDIO = 'cerrar el canal de audio bidireccional';

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

const configuracionDe = ({ prefijo, familia }) => {
  if (simulado) {
    // Nombres bajo `.invalid` (RFC 2606): no resuelven a nada y KPI-11 no los
    // toma por direcciones de equipo. El simulador contesta por ellos.
    return {
      host: `${familia}.simulado.invalid`,
      usuario: 'servicio',
      clave: 'clave-simulada',
      puerto: 80,
      canal: CARRIL_VERIFICADO_DE_LA_CAMARA,
    };
  }
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
  const canal = Number(process.env[`${prefijo}_CANAL`] ?? String(CARRIL_VERIFICADO_DE_LA_CAMARA));
  return {
    host,
    usuario,
    clave,
    puerto: Number.isInteger(puerto) && puerto > 0 ? puerto : 80,
    canal: Number.isInteger(canal) && canal > 0 ? canal : CARRIL_VERIFICADO_DE_LA_CAMARA,
  };
};

/** Los tres equipos simulados, uno por familia, con todo lo que un equipo conforme declara. */
const peticionSimulada = () =>
  equiposSimulados({
    'camara.simulado.invalid': { familia: 'camara', usuario: 'servicio', clave: 'clave-simulada' },
    'terminal.simulado.invalid': {
      familia: 'terminal',
      usuario: 'servicio',
      clave: 'clave-simulada',
      verificacionRemota: true,
    },
    'videoportero.simulado.invalid': {
      familia: 'videoportero',
      usuario: 'servicio',
      clave: 'clave-simulada',
      aperturaRemota: true,
      senalizaLlamadas: true,
      admiteSuscripcion: true,
      canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }],
    },
  });

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

/** Cada estado de la ficha con su signo y su palabra: el signo no va solo. */
const ESTADO_DE_FICHA = {
  conforme: '✓ conforme',
  aviso: '⚠ aviso',
  bloqueo: '✗ BLOQUEO',
  no_comprobado: '· sin comprobar',
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
anotar(
  `Modo: ${simulado ? 'SIMULADO — ningún aparato real; NO vale como verificación' : 'contra equipos reales'}`,
);
anotar(`Accionamiento de relés y puertas: ${sinAccionar ? 'OMITIDO (--sin-accionar)' : 'SÍ'}`);
anotar(
  `Canal de audio del videoportero: ${conAudio ? 'se abre y se cierra (--con-audio)' : 'no se toca'}`,
);
anotar('');

/** Resuelve el marcador de canal de una ruta con el canal declarado; las demás salen tal cual. */
const resuelta = (ruta, canal) =>
  exigeCanal(ruta) ? rutaPara(ruta.proposito, ruta.familia, canal) : ruta;

const peticion = simulado ? peticionSimulada() : undefined;

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
  anotar(`── ${entrada.rotulo} · ${elidir(config.host)}:${config.puerto} · canal ${config.canal}`);

  const conexion = {
    host: config.host,
    puerto: config.puerto,
    protocolo: 'http',
    usuario: config.usuario,
    clave: config.clave,
    tiempoLimiteMs: 6000,
    ...(peticion === undefined ? {} : { peticion }),
  };
  const cliente = new ClienteDeEquipo(conexion);

  const aplicables = RUTAS.filter(
    (r) => r.familia === entrada.familia || r.familia === 'comun',
  ).sort((a, b) => (PESO[a.procedencia] ?? 0) - (PESO[b.procedencia] ?? 0));

  for (const rutaDelCatalogo of aplicables) {
    const ruta = resuelta(rutaDelCatalogo, config.canal);
    const omitida = ruta.dejaRastro === true || (sinAccionar && ruta.acciona === true);
    if (omitida) {
      const motivo =
        ruta.dejaRastro === true
          ? 'cambia el estado del equipo: se prueba a mano, con la guía delante'
          : 'acciona un relé o una puerta; se pidió no accionar';
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

    // El accionamiento tiene umbral, y es el único que lo tiene: KPI-13 en la
    // barrera y la puerta de la terminal, KPI-32 en la puerta del videoportero.
    if (
      ruta.acciona === true &&
      veredicto === 'confirmada' &&
      ms !== null &&
      ms > UMBRAL_DE_ACCIONAMIENTO_MS
    ) {
      huboProblema = true;
      anotar(
        `       ⚠ ${entrada.kpi}: ${Math.round(ms)} ms supera el umbral de ${UMBRAL_DE_ACCIONAMIENTO_MS} ms`,
      );
    } else if (ruta.acciona === true && veredicto === 'confirmada' && ms !== null) {
      anotar(
        `       ${entrada.kpi}: ${Math.round(ms)} ms, dentro del umbral (< ${UMBRAL_DE_ACCIONAMIENTO_MS} ms)`,
      );
    }
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * LA FICHA POR FAMILIA · O4
   *
   * Las rutas dicen si el equipo CONTESTA; la ficha dice si se puede OPERAR con
   * él: quién decide, qué declara, si su reloj está en hora. Es el mismo
   * diagnóstico que usa la consola al dar de alta el equipo, ejecutado aquí
   * para que el informe de sitio y la pantalla digan lo mismo.
   */
  anotar('   ── Ficha del equipo (mismo diagnóstico que la consola)');
  const diagnostico = await diagnosticarEquipo({
    ...conexion,
    familia: entrada.familia,
    canal: config.canal,
  });
  const ficha = fichaDe(diagnostico);
  anotar(
    `   identidad: ${ficha.modelo ?? 'modelo sin declarar'}` +
      (ficha.firmware === null ? '' : ` · ${ficha.firmware}`) +
      (ficha.serie === null ? '' : ` · serie ${ficha.serie}`),
  );
  for (const hallazgo of ficha.hallazgos) {
    anotar(`   ${ESTADO_DE_FICHA[hallazgo.estado] ?? hallazgo.estado} · ${hallazgo.campo}`);
    anotar(`       ${hallazgo.detalle}`);
    if (hallazgo.valorLeido !== null || hallazgo.valorCorrecto !== null) {
      anotar(
        `       leído: ${hallazgo.valorLeido ?? '(nada)'}` +
          (hallazgo.valorCorrecto === null ? '' : ` · debería ser: ${hallazgo.valorCorrecto}`),
      );
    }
    if (hallazgo.estado === 'bloqueo') huboProblema = true;
  }
  for (const linea of ficha.sinComprobar) anotar(`   · no contestó: ${linea}`);
  const c = diagnostico.capacidadesDelEquipo;
  if (c !== null) {
    anotar(
      `   capacidades (${c.origen}): apertura remota ${c.aperturaRemota} · verificación remota ` +
        `${c.verificacionRemota} · biblioteca ${c.bibliotecaDeRostros.estado} · audio ` +
        `${c.audioBidireccional.estado}${c.audioBidireccional.canal === null ? '' : ` (canal ${c.audioBidireccional.canal})`}` +
        ` · llamada ${c.senalizacionDeLlamada} · suscripción ${c.suscripcionDeEventos} · placas ${c.reconocimientoDePlacas}`,
    );
  }

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * KPI-33 · SÓLO SU PROXY, Y SE DICE
   *
   * El compromiso es audio y video < 2 s de extremo a extremo, y el extremo
   * lejano es el navegador del operador: eso no se puede medir desde aquí. Lo
   * que sí se puede medir es cuánto tarda el equipo en abrir el canal, que es
   * una cota INFERIOR del total. Se abre, se mide, se cierra explícitamente.
   */
  if (conAudio && entrada.familia === 'videoportero') {
    anotar('   ── Canal de audio (--con-audio)');
    const canalDeAudio = c?.audioBidireccional.canal ?? config.canal;
    if (c !== null && c.audioBidireccional.estado !== 'si') {
      anotar(
        `   · el equipo no declara canal de audio utilizable (${c.audioBidireccional.estado}): no se abre`,
      );
    } else {
      const abrir = rutaPara(PROPOSITO_ABRIR_AUDIO, 'videoportero', canalDeAudio);
      const cerrar = rutaPara(PROPOSITO_CERRAR_AUDIO, 'videoportero', canalDeAudio);
      const apertura = await sondear(cliente, abrir);
      anotar(
        `   ${ICONO[apertura.veredicto]} ${abrir.proposito} (canal ${canalDeAudio}) — ${apertura.veredicto}: ${apertura.detalle}` +
          (apertura.ms === null ? '' : ` · ${Math.round(apertura.ms)} ms`),
      );
      if (apertura.veredicto === 'confirmada' && apertura.ms !== null) {
        if (apertura.ms > UMBRAL_DE_AUDIO_MS) {
          huboProblema = true;
          anotar(
            `       ⚠ KPI-33 (proxy): ${Math.round(apertura.ms)} ms sólo en abrir el canal; el extremo a extremo no puede bajar de ahí`,
          );
        } else {
          anotar(
            `       KPI-33 (proxy): la apertura del canal tardó ${Math.round(apertura.ms)} ms. NO es la medida extremo a extremo: ésa exige el navegador del operador`,
          );
        }
      } else {
        huboProblema = true;
      }
      const cierre = await sondear(cliente, cerrar);
      anotar(
        `   ${ICONO[cierre.veredicto]} ${cerrar.proposito} — ${cierre.veredicto}: ${cierre.detalle}`,
      );
      if (cierre.veredicto !== 'confirmada') {
        huboProblema = true;
        anotar(
          '       ⚠ el canal pudo quedar abierto: ciérrelo desde la interfaz del equipo antes de seguir',
        );
      }
    }
  }
  anotar('');
}

if (!algunEquipo && !huboProblema) {
  anotar(
    'No había ningún equipo declarado. Defina al menos BARRERA_HOST y repita (o use --simulado).',
  );
  huboProblema = true;
}

anotar('');
anotar(
  huboProblema
    ? 'VEREDICTO: hay rutas desmentidas, equipos inalcanzables, bloqueos en la ficha o latencias fuera de umbral.'
    : 'VEREDICTO: todas las rutas sondeadas quedan CONFIRMADAS y ninguna ficha tiene bloqueos.',
);
if (simulado) {
  anotar(
    'ESTE VEREDICTO ES SIMULADO: no se habló con ningún aparato. Sirve para ensayar el guion, no para verificar.',
  );
}
anotar('');
anotar('Lo que este guion NO hizo, y le toca a usted (guía §8):');
anotar('  · cámara: desactivar la apertura por lista local y apuntar la subida HTTP;');
anotar('  · terminal facial: activar la verificación remota si la ficha la marcó como bloqueo;');
anotar('  · videoportero: habilitar el canal de audio en el aparato si la ficha lo avisó;');
anotar(
  '  · KPI-33 extremo a extremo: medirlo con la consola de guardia abierta, cronómetro en mano.',
);
anotar('Anote el estado PREVIO de cada ajuste antes de tocarlo.');

try {
  const cuerpo = `# Puesta en marcha en sitio${simulado ? ' (SIMULADO)' : ''}\n\n\`\`\`\n${lineas.join('\n')}\n\`\`\`\n`;
  writeFileSync(resolve(destinoInforme), cuerpo, 'utf8');
  console.log('');
  console.log(`Informe escrito en ${resolve(destinoInforme)}`);
  console.log('Host y usuario salen ELIDIDOS: el informe se puede adjuntar.');
} catch (error) {
  console.error(`No se pudo escribir el informe: ${String(error?.message ?? error)}`);
}

process.exit(huboProblema ? 1 : 0);
