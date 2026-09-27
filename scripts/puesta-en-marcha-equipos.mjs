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
 *  7 · **Escribe la HOJA DE RESULTADOS** (ETAPA 15-E · A8): la plantilla de los
 *      dieciséis escenarios de aceptación —5 de la cámara, 5 de la terminal,
 *      6 del videoportero— con lo que este guion ya sabe (fecha, modo, qué
 *      familias estaban declaradas, las latencias que midió como referencia)
 *      y las columnas que rellena la persona delante del equipo: esperado ·
 *      obtenido · motivo en consola · latencia · evento en /eventos ·
 *      evidencia · veredicto. Sin esa hoja rellenada la ETAPA 15 no se cierra.
 *  8 · Con `--capturar[=<carpeta>]` (15-K · §5) **guarda lo que contestó cada
 *      equipo**, petición y respuesta, SANEADAS (sin claves, IPs tachadas), en
 *      una carpeta FUERA del repositorio: capacidades, parámetros de entrada,
 *      disparadores, verificación remota, biblioteca de rostros… todo lo que
 *      el guion pregunta. Y en la terminal (o el videoportero con biblioteca)
 *      hace una CARGA DE PRUEBA con una imagen sintética sin rostro, captura
 *      cómo la trata el equipo y da de baja la persona de prueba. En sitio, el
 *      26/09/2026, cuatro fallos quedaron sin diagnóstico por no tener esto.
 *  9 · Con `--abrir` (anexo 15-K) hace SÓLO la verificación de la próxima
 *      visita: abre la puerta de la terminal y la del videoportero como
 *      abrieron en sitio —`PUT door/<n>`, Content-Type de formulario, cuerpo
 *      con el espacio de nombres y `version="2.0"`, Digest con el cuerpo desde
 *      la primera petición, 401 → 200 con `statusCode 1`—, escribe cada
 *      petición y respuesta, y PREGUNTA si la puerta se movió. La barrera de la
 *      cámara no entra: su orden es otra y la acciona el recorrido normal
 *      (`scripts/lib/apertura-en-sitio.mjs`).
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
 * `--capturar` SÍ escribe en la terminal: da de alta una persona de prueba con
 * la imagen sintética y la da de baja al terminar, la acepte o no. Si la baja
 * falla, el guion lo dice y sale en 1: hay que borrarla a mano.
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
 *   node scripts/puesta-en-marcha-equipos.mjs --simulado --hoja=./hoja.md --informe=./informe.md
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --sin-accionar --capturar
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --capturar=$HOME/capturas-sitio
 *   node --env-file=apps/api/.env scripts/puesta-en-marcha-equipos.mjs --abrir --capturar
 *   node scripts/puesta-en-marcha-equipos.mjs --simulado --abrir
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
import { hojaDeResultados } from './lib/hoja-de-resultados.mjs';
import { preguntarSiSeMovio, verificarApertura } from './lib/apertura-en-sitio.mjs';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * ETAPA 15-D · la entrada de OPERACIÓN del paquete, no su barril (D-132). El
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
  aperturaDeVerificacion,
  aperturasFisicasPor,
  CARRIL_VERIFICADO_DE_LA_CAMARA,
  cargaDePruebaDeRostro,
  diagnosticarEquipo,
  documentoSaneado,
  equiposSimulados,
  exigeCanal,
  fichaDe,
  interpretarError,
  juzgarModo,
  leerCtrlMod,
  opcionesDeEscritura,
  rutaPara,
} = createRequire(import.meta.url)(compilado);

const argumentos = process.argv.slice(2);
const sinAccionar = argumentos.includes('--sin-accionar');
const conAudio = argumentos.includes('--con-audio');
const simulado = argumentos.includes('--simulado');
const abrir = argumentos.includes('--abrir');
const destinoInforme =
  argumentos.find((a) => a.startsWith('--informe='))?.slice('--informe='.length) ??
  join(process.env.TMPDIR ?? '/tmp', 'puesta-en-marcha-equipos.md');
/** A8 · la hoja de resultados sale junto al informe, fuera del árbol por omisión. */
const destinoHoja =
  argumentos.find((a) => a.startsWith('--hoja='))?.slice('--hoja='.length) ??
  join(process.env.TMPDIR ?? '/tmp', 'hoja-de-resultados-en-sitio.md');
/**
 * 15-K (§5) · `--capturar[=<carpeta>]`. Por omisión, una carpeta nueva en el
 * directorio temporal. NUNCA dentro del repositorio: lo que contesta un equipo
 * real no se versiona, igual que `docs/hikdocs/`.
 */
const argumentoDeCaptura = argumentos.find(
  (a) => a === '--capturar' || a.startsWith('--capturar='),
);
const capturar = argumentoDeCaptura !== undefined;
const carpetaDeCapturas = resolve(
  argumentoDeCaptura?.startsWith('--capturar=') === true
    ? argumentoDeCaptura.slice('--capturar='.length)
    : join(
        process.env.TMPDIR ?? '/tmp',
        `ncr-capturas-${new Date().toISOString().replace(/[:.]/g, '-')}`,
      ),
);
const raizResuelta = resolve(raiz);
if (
  capturar &&
  (carpetaDeCapturas === raizResuelta || carpetaDeCapturas.startsWith(raizResuelta + sep))
) {
  console.error('--capturar NO escribe dentro del repositorio: lo que contesta un equipo real');
  console.error(
    'no se versiona. Indique una carpeta fuera, p. ej. --capturar=$HOME/capturas-sitio',
  );
  process.exit(2);
}

/**
 * La imagen de la CARGA DE PRUEBA: un JPEG gris de 64×64 generado por un
 * lienzo, sin rostro de nadie. Lo esperado es que el equipo la RECHACE; lo que
 * se captura es CÓMO (estado, subestado, código). Si la acepta, se borra.
 */
const IMAGEN_SINTETICA = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCABAAEADASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/9k=',
  'base64',
);

/** Qué familias se declararon y qué latencias se midieron: van a la hoja como referencia. */
const declaradas = {};
const referencias = [];

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
    // Anexo 15-K · una escritura sin cuerpo sólo sale si el catálogo lo declara
    // (el canal de audio); cualquier otra, el cliente la rechaza (H-SITIO-15).
    const respuesta = await cliente.pedir(
      ruta.metodo,
      ruta.ruta,
      cuerpo,
      opcionesDeEscritura(ruta),
    );
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

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * LA GRABADORA · 15-K (§5)
 *
 * Envuelve el transporte: cada petición que el guion hace —el sondeo del
 * catálogo, la ficha, la carga de prueba— queda con su respuesta. El cuerpo se
 * guarda SANEADO (`documentoSaneado`: sin claves ni tokens, IPv4 tachadas,
 * acotado) y lo binario —la imagen de la carga— se cuenta, no se vuelca.
 * Las cabeceras no se guardan nunca: ahí viaja el Digest.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const cuerpoLegible = (cuerpo) => {
  if (cuerpo === undefined || cuerpo === null) return '';
  const texto = typeof cuerpo === 'string' ? cuerpo : Buffer.from(cuerpo).toString('latin1');
  return texto.replace(
    /[\x00-\x08\x0e-\x1f\x7f-\xff]{8,}[\s\S]*?(?=\r?\n--|$)/g,
    (m) => `[${String(m.length)} bytes binarios: la imagen no se vuelca]`,
  );
};

const grabadoraDe = (base, registro) => async (entrada, opciones) => {
  const respuesta = await base(entrada, opciones);
  const url = new URL(String(entrada));
  // La lectura del cuerpo NO se espera aquí: un flujo de eventos no termina.
  const recibido =
    typeof respuesta.clone === 'function'
      ? respuesta
          .clone()
          .text()
          .catch(() => '(no se pudo leer)')
      : Promise.resolve(respuesta.text()).catch(() => '(no se pudo leer)');
  registro.push({
    metodo: opciones?.method ?? 'GET',
    ruta: `${url.pathname}${url.search}`,
    estado: respuesta.status,
    enviado: cuerpoLegible(opciones?.body),
    recibido,
  });
  return respuesta;
};

const volcarCapturas = async (carpeta, registro) => {
  mkdirSync(carpeta, { recursive: true });
  let n = 0;
  for (const i of registro) {
    n += 1;
    const recibido = await Promise.race([
      i.recibido,
      new Promise((listo) =>
        setTimeout(() => listo('(flujo abierto: no se esperó a su fin)'), 2000),
      ),
    ]);
    const nombre = `${String(n).padStart(3, '0')}-${i.metodo}-${i.ruta
      .replace(/[^A-Za-z0-9]+/g, '-')
      .slice(0, 60)}.txt`;
    writeFileSync(
      join(carpeta, nombre),
      [
        `${i.metodo} ${documentoSaneado(i.ruta)}`,
        `HTTP ${String(i.estado)}`,
        '',
        '--- enviado (saneado)',
        documentoSaneado(i.enviado),
        '',
        '--- recibido (saneado)',
        documentoSaneado(String(recibido)),
        '',
      ].join('\n'),
      'utf8',
    );
  }
  return n;
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
anotar(
  abrir
    ? 'Modo --abrir: SÓLO la apertura de puerta de la terminal y del videoportero, como abrió en sitio'
    : `Accionamiento de relés y puertas: ${sinAccionar ? 'OMITIDO (--sin-accionar)' : 'SÍ'}`,
);
anotar(
  `Canal de audio del videoportero: ${conAudio ? 'se abre y se cierra (--con-audio)' : 'no se toca'}`,
);
anotar(
  `Captura de respuestas crudas: ${capturar ? `SÍ, en ${carpetaDeCapturas} (fuera del repositorio)` : 'no (añada --capturar)'}`,
);
anotar('');

/** Resuelve el marcador de canal de una ruta con el canal declarado; las demás salen tal cual. */
const resuelta = (ruta, canal) =>
  exigeCanal(ruta) ? rutaPara(ruta.proposito, ruta.familia, canal) : ruta;

const peticion = simulado ? peticionSimulada() : undefined;

const escribirInforme = () => {
  try {
    const cuerpo = `# Puesta en marcha en sitio${simulado ? ' (SIMULADO)' : ''}\n\n\`\`\`\n${lineas.join('\n')}\n\`\`\`\n`;
    writeFileSync(resolve(destinoInforme), cuerpo, 'utf8');
    console.log('');
    console.log(`Informe escrito en ${resolve(destinoInforme)}`);
    console.log('Host y usuario salen ELIDIDOS: el informe se puede adjuntar.');
  } catch (error) {
    console.error(`No se pudo escribir el informe: ${String(error?.message ?? error)}`);
  }
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * ANEXO 15-K · `--abrir`: la apertura demostrada, y la pregunta que sólo puede
 * contestar quien mira la puerta. En `--simulado` la contesta el equipo
 * simulado, que sabe si accionó.
 */
if (abrir) {
  let alguna = false;
  for (const entrada of FAMILIAS.filter((f) => f.familia !== 'camara')) {
    const config = configuracionDe(entrada);
    if (config === null || config.faltan !== undefined) {
      anotar(
        `── ${entrada.rotulo} · ${config === null ? `NO DECLARADO (sin ${entrada.prefijo}_HOST)` : `faltan ${config.faltan.join(', ')}`}. Se omite.`,
      );
      huboProblema ||= config !== null;
      continue;
    }
    alguna = true;
    const registro = [];
    const transporte = capturar ? grabadoraDe(peticion ?? fetch, registro) : peticion;
    const destino = config.host;
    const antes = aperturasFisicasPor.get(destino) ?? 0;
    const problema = await verificarApertura({
      familia: entrada.familia,
      rotulo: entrada.rotulo,
      cabecera: `${entrada.rotulo} · ${elidir(config.host)}:${config.puerto}`,
      kpi: entrada.kpi,
      puerta: config.canal,
      umbralMs: UMBRAL_DE_ACCIONAMIENTO_MS,
      conexion: {
        host: config.host,
        puerto: config.puerto,
        protocolo: 'http',
        usuario: config.usuario,
        clave: config.clave,
        tiempoLimiteMs: 6000,
        ...(transporte === undefined ? {} : { peticion: transporte }),
      },
      aperturaDeVerificacion,
      seMovio: simulado
        ? async () => ((aperturasFisicasPor.get(destino) ?? 0) > antes ? 'si' : 'no')
        : () => preguntarSiSeMovio(entrada.rotulo),
      anotar,
    });
    huboProblema ||= problema;
    if (capturar) {
      const carpeta = join(carpetaDeCapturas, `${entrada.familia}-abrir`);
      anotar(
        `   ── ${String(await volcarCapturas(carpeta, registro))} intercambio(s) capturados en ${carpeta}`,
      );
    }
  }
  if (!alguna) {
    anotar('Ni terminal ni videoportero declarados: defina TERMINAL_HOST o VIDEOPORTERO_HOST.');
    huboProblema = true;
  }
  anotar(
    huboProblema
      ? 'VEREDICTO --abrir: la apertura NO queda verificada (arriba, qué falta).'
      : 'VEREDICTO --abrir: la orden se aceptó como en sitio y la puerta se movió.',
  );
  if (simulado) anotar('SIMULADO: el ensayo del procedimiento, no una verificación.');
  escribirInforme();
  process.exit(huboProblema ? 1 : 0);
}

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
  declaradas[entrada.familia] = true;
  anotar(`── ${entrada.rotulo} · ${elidir(config.host)}:${config.puerto} · canal ${config.canal}`);

  const registro = [];
  const transporte = capturar ? grabadoraDe(peticion ?? fetch, registro) : peticion;
  const conexion = {
    host: config.host,
    puerto: config.puerto,
    protocolo: 'http',
    usuario: config.usuario,
    clave: config.clave,
    tiempoLimiteMs: 6000,
    ...(transporte === undefined ? {} : { peticion: transporte }),
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
    if (ruta.acciona === true && veredicto === 'confirmada' && ms !== null) {
      referencias.push(
        `${entrada.rotulo} · ${ruta.proposito}: ${Math.round(ms)} ms API → equipo (${entrada.kpi})`,
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
        referencias.push(
          `${entrada.rotulo} · apertura del canal de audio: ${Math.round(apertura.ms)} ms (proxy de KPI-33)`,
        );
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

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * 15-K (§5) · LA CARGA DE PRUEBA, Y LA CAPTURA DE TODO LO ANTERIOR
   *
   * H-SITIO-04: en sitio la carga de plantillas falló y no quedó qué contestó
   * el equipo. Aquí se hace una carga con una imagen SIN ROSTRO —lo esperado
   * es que la rechace— para capturar CÓMO responde a la secuencia completa
   * (alta de persona, formulario de la imagen, búsqueda). Después se da de baja
   * la persona de prueba, la acepte o no: no queda nada nuestro en el equipo.
   */
  const conBiblioteca =
    entrada.familia === 'terminal' ||
    (entrada.familia === 'videoportero' && c?.bibliotecaDeRostros.estado === 'si');
  if (capturar && conBiblioteca) {
    anotar('   ── Carga de prueba (--capturar): imagen sintética SIN rostro');
    const prueba = await cargaDePruebaDeRostro(conexion, IMAGEN_SINTETICA, randomUUID());
    anotar(
      prueba.aceptada
        ? '   ⚠ el equipo ACEPTÓ una imagen sin rostro: no valida lo que recibe. Anótelo en la hoja.'
        : `   · el equipo la rechazó (lo esperado): ${String(prueba.rechazo).slice(0, 300)}`,
    );
    if (prueba.baja === null) {
      huboProblema = true;
      anotar(
        `   ⚠ no se pudo dar de baja la persona de prueba ${prueba.employeeNo} ` +
          `(${String(prueba.errorDeBaja).slice(0, 200)}): bórrela a mano en el equipo antes de seguir`,
      );
    } else {
      anotar(
        `   · baja de la persona de prueba pedida: HTTP ${String(prueba.baja.estado)} (el equipo la ejecuta en segundo plano)`,
      );
      // Un rechazo de la baja es inocuo si la persona nunca llegó a crearse, y
      // no lo es si se creó: sólo el equipo lo sabe, así que se dice.
      if (!prueba.baja.ok) {
        anotar(
          `   ⚠ la baja no se aceptó: compruebe en el equipo que no quedó la persona ${prueba.employeeNo}`,
        );
      }
    }
  }
  if (capturar) {
    const carpeta = join(carpetaDeCapturas, entrada.familia);
    const n = await volcarCapturas(carpeta, registro);
    anotar(`   ── ${String(n)} intercambio(s) capturados en ${carpeta}`);
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

escribirInforme();

/**
 * A8 · la hoja de resultados. Es una PLANTILLA: lo que el guion sabe va
 * rellenado, lo que sólo se sabe delante del equipo va en blanco. Sale aunque
 * el veredicto de arriba sea malo, porque el veredicto del guion y el de la
 * hoja miden cosas distintas: aquél, que las rutas existen; ésta, que el
 * sistema cumple sus criterios de aceptación.
 */
try {
  writeFileSync(
    resolve(destinoHoja),
    hojaDeResultados({
      modo: simulado ? 'simulado' : 'real',
      declaradas,
      referencias,
      capturas: capturar ? carpetaDeCapturas : null,
    }),
    'utf8',
  );
  console.log(`Hoja de resultados (16 escenarios) escrita en ${resolve(destinoHoja)}`);
  console.log('Rellénela delante de los equipos: sin ella, la ETAPA 15 no se cierra (BE-02).');
} catch (error) {
  console.error(`No se pudo escribir la hoja de resultados: ${String(error?.message ?? error)}`);
}

process.exit(huboProblema ? 1 : 0);
