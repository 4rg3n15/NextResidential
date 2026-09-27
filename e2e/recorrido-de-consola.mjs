/**
 * ═════════════════════════════════════════════════════════════════════════════
 * §4 (15-K) · LA CONSOLA CONTRA LA API REAL, CON POSTGRESQL Y EL PROVEEDOR SIMULADO
 *
 * El 26/09/2026, en sitio, tres defectos que la suite no veía se vieron en el
 * primer minuto de uso: el alta de un equipo no aparecía en «Dispositivos»
 * (H-SITIO-02), la edición no se guardaba (H-SITIO-08) y el superadministrador
 * no podía llevar la foto de un visitante a los equipos (H-SITIO-03). Los tres
 * vivían en la
 * COSTURA entre la consola, el proxy, la API y la base: cada pieza tenía sus
 * pruebas en verde con dobles de las otras.
 *
 * Esto recorre esa costura como la recorre una persona:
 *
 *   · base PostgreSQL PROPIA, recién migrada y sembrada, con la API conectada
 *     como el rol dueño NO superusuario (`sb_postgres_sim`), igual que Supabase;
 *   · un doble de GoTrue que emite los claims del GANCHO REAL de la base;
 *   · la API real, compilada con `tsc` (la de una sonda, compilada en su
 *     árbol): con `tsx` el ValidationPipe no valida nada (H-SITIO-06, anexo)
 *     y la API se niega a arrancar;
 *   · la consola COMPILADA;
 *   · dos equipos SIMULADOS escuchando por HTTP con Digest —cámara y terminal—,
 *     los mismos de `packages/providers`: el alta, el diagnóstico y la
 *     corrección van por la red de verdad;
 *   · el proveedor de equipos `hikvision` —el adaptador real— contra esos
 *     equipos simulados, que reproducen lo visto en sitio (anexo 15-K).
 *
 * Como SUPERADMINISTRADOR: acceso con segundo factor, alta de la cámara y de
 * la terminal, ficha con diagnóstico y corrección, edición (PUT), apertura
 * desde Portería y desde Guardia virtual con su «Historial inmediato».
 * Como PORTERO: turno asignado por el superadministrador, acceso con su número
 * y apertura con motivo.
 *
 * Y la VISITA de la entrega (F, 15-L), con los dos a la vez: el
 * superadministrador genera la autorización con foto y casilla, nace vigente,
 * la foto llega a la terminal; el portero recibe el aviso en su pantalla y la
 * rechaza con motivo, y la foto SALE de la terminal —lo dice el equipo
 * simulado, no la consola—. Al final, los eventos se ven y ninguna pantalla
 * de ninguno de los dos roles enseña un código del proyecto (Bloque I).
 *
 * Las afirmaciones que cazan los defectos de sitio llevan su identificador:
 * `e2e/recorrido-negativo.mjs` los reintroduce uno a uno y exige verlos fallar.
 *
 * Variables para las sondas: `NCR_RAIZ_API`, `NCR_RAIZ_WEB` (árboles de sonda,
 * con la API ya compilada), `NCR_REUTILIZAR_CONSOLA=1` (no recompilar la
 * consola si ya hay `.next`).
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer as servidorHttp } from 'node:http';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright';
import { authenticator } from 'otplib';
import { arrancarDobleGotrue } from './doble-gotrue.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const raizApi = process.env.NCR_RAIZ_API ?? raiz;
const raizWeb = process.env.NCR_RAIZ_WEB ?? raiz;
const requerirDe = (paquete) => createRequire(resolve(raiz, paquete, 'package.json'));
const { Pool } = requerirDe('apps/api')('pg');
const { equipoSimulado, aperturasFisicasPor, escriturasSinCuerpoPor, plantillasPor } =
  requerirDe('apps/api')('@ncr/providers');
/** Rótulos del simulado: el oráculo de lo que el EQUIPO hizo (anexo 15-K). */
const CAMARA_SIMULADA = 'camara-del-recorrido';
const TERMINAL_SIMULADA = 'terminal-del-recorrido';

const MIRA = '10000000-0000-4000-8000-000000000001';
const BASE_PLANTILLA = 'ncr_recorrido_plantilla';
const BASE = 'ncr_recorrido';
/**
 * El rol con el que se conecta la API, como `postgres` en Supabase: NO es
 * superusuario, hereda los privilegios del DUEÑO de las tablas y OMITE la RLS.
 *
 * [SUPUESTO] S-15K-1 · que `postgres` omite la RLS en Supabase. La evidencia es
 * de sitio: el buscador de personas devolvió resultados, y el repositorio del
 * padrón fija `request.jwt.claims = {}` — con la RLS aplicada no vería ninguna
 * fila. El 26/09/2026 esta misma corrida lo demostró con el dueño simulado
 * (`sb_postgres_sim`, sin BYPASSRLS): el buscador quedó vacío. Ocho
 * repositorios dependen de ello; un rol `app_api` sin BYPASSRLS (ADR-005,
 * defensa adicional) los dejaría vacíos. Deuda declarada en el informe 15-K.
 */
const ROL_DE_LA_API = 'sb_postgres_api';
const DUENO_SIMULADO = 'sb_postgres_sim';
const SECRETO_DE_INGESTA = `ingesta-del-recorrido-${randomBytes(12).toString('hex')}`;

/** Las cuentas SEMBRADAS (supabase/seed): su `auth_user_id` y su correo. Claves de un solo uso. */
const SUPERADMIN = {
  id: '00000000-0000-4000-8000-0000000000a2',
  correo: 'superadmin@nextcontrol.invalid',
  contrasena: `Ncr-${randomBytes(12).toString('base64url')}`,
  rol: 'superadministrador',
  copropiedadId: null,
};
const PORTERO = {
  id: '00000000-0000-4000-8000-0000000000b1',
  correo: 'carlos.mendoza@urbanizacionmira.invalid',
  contrasena: `Ncr-${randomBytes(12).toString('base64url')}`,
  rol: 'portero',
  copropiedadId: MIRA,
};

const procesos = [];
const servidores = [];
/** Lo que el puente de los equipos simulados no pudo servir: se enseña al final. */
const erroresDeEquipo = [];
let fallos = 0;
const ok = (m) => console.log(`   ✓ ${m}`);
const mal = (m) => {
  console.log(`   ✗ ${m}`);
  fallos += 1;
};
const paso = (m) => console.log(`\n▸ ${m}`);
const afirmar = (condicion, mensaje) => (condicion ? ok(mensaje) : mal(mensaje));

/** Un bloque que falla no tumba el recorrido: se dice cuál y se sigue. */
const bloque = async (etiqueta, fn) => {
  try {
    await fn();
  } catch (e) {
    mal(`${etiqueta}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
  }
};

const puertoLibre = () =>
  new Promise((listo) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => listo(port));
    });
  });

const chromiumDelEntorno = () => {
  const explicito = process.env.NCR_CHROMIUM;
  if (explicito !== undefined && explicito !== '') return existsSync(explicito) ? explicito : null;
  const raices = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(
    (r) => typeof r === 'string' && r.length > 0 && existsSync(r),
  );
  for (const base of raices) {
    for (const carpeta of readdirSync(base).filter((d) => d.startsWith('chromium'))) {
      const hallado = [
        join(base, carpeta, 'chrome-linux', 'chrome'),
        join(base, carpeta, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        join(base, carpeta, 'chrome'),
      ].find((ruta) => existsSync(ruta));
      if (hallado !== undefined) return hallado;
    }
  }
  try {
    return existsSync(chromium.executablePath()) ? undefined : null;
  } catch {
    return null;
  }
};

const lanzar = (comando, args, opciones) => {
  const proceso = spawn(comando, args, { ...opciones, stdio: ['ignore', 'pipe', 'pipe'] });
  const salida = [];
  proceso.stdout.on('data', (d) => salida.push(String(d)));
  proceso.stderr.on('data', (d) => salida.push(String(d)));
  procesos.push({ proceso, salida, nombre: opciones.nombre ?? comando });
  return { proceso, salida };
};

const volcar = () => {
  for (const { nombre, salida } of procesos) {
    writeFileSync(`/tmp/ncr-recorrido-${nombre}.log`, salida.join(''));
  }
  console.log('   · salida completa en /tmp/ncr-recorrido-{api,web}.log');
};

const cerrarTodo = async () => {
  for (const { proceso } of procesos) {
    try {
      process.kill(-proceso.pid, 'SIGKILL');
    } catch {
      try {
        proceso.kill('SIGKILL');
      } catch {
        /* ya no está */
      }
    }
  }
  for (const s of servidores) await new Promise((listo) => s.close(() => listo()));
};

const esperar = async (url, etiqueta, intentos = 120) => {
  for (let i = 0; i < intentos; i += 1) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return true;
    } catch {
      /* todavía no escucha */
    }
    await new Promise((listo) => setTimeout(listo, 1000));
  }
  mal(`${etiqueta} no llegó a responder en ${String(intentos)} s`);
  volcar();
  return false;
};

// ── Imagen sintética: nítida, bien iluminada, sin rostro de nadie ───────────
const TABLA_CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (datos) => {
  let c = 0xffffffff;
  for (const b of datos) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const trozoPng = (tipo, datos) => {
  const nombre = Buffer.from(tipo, 'ascii');
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([nombre, datos])));
  return Buffer.concat([largo, nombre, datos, crc]);
};
/** Un damero de 4 px en grises medios: pasa nitidez e iluminación de la consola. */
const pngSintetico = (lado = 320) => {
  const filas = [];
  for (let y = 0; y < lado; y += 1) {
    const fila = Buffer.alloc(1 + lado * 3);
    for (let x = 0; x < lado; x += 1) {
      const v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0 ? 90 : 170;
      fila.fill(v, 1 + x * 3, 4 + x * 3);
    }
    filas.push(fila);
  }
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0);
  cabecera.writeUInt32BE(lado, 4);
  cabecera[8] = 8;
  cabecera[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    trozoPng('IHDR', cabecera),
    trozoPng('IDAT', deflateSync(Buffer.concat(filas))),
    trozoPng('IEND', Buffer.alloc(0)),
  ]);
};

// ── Equipos simulados por HTTP ───────────────────────────────────────────────
/**
 * El MISMO equipo simulado de `packages/providers` (Digest, documentos de la
 * guía, estado que la corrección cambia), puesto a escuchar en un puerto. La
 * API le habla por la red como a uno de verdad.
 */
const equipoPorHttp = async (guion) => {
  const simulado = equipoSimulado(guion);
  const servidor = servidorHttp(async (peticion, respuesta) => {
    const trozos = [];
    for await (const t of peticion) trozos.push(t);
    const cuerpo = Buffer.concat(trozos);
    try {
      const r = await simulado(`http://127.0.0.1${peticion.url ?? '/'}`, {
        method: peticion.method,
        headers: Object.fromEntries(
          Object.entries(peticion.headers).filter(([, v]) => typeof v === 'string'),
        ),
        ...(cuerpo.length === 0 ? {} : { body: cuerpo.toString('utf8') }),
      });
      const cabeceras = {};
      r.headers.forEach((v, k) => {
        cabeceras[k] = v;
      });
      // El simulado contesta con respuestas mínimas: `text()` y `body: null`,
      // salvo el flujo de eventos, que trae un cuerpo propio (`ReadableStream`).
      const trozosDeSalida = [];
      if (r.body !== null && r.body !== undefined && typeof r.body.getReader === 'function') {
        const lector = r.body.getReader();
        for (;;) {
          const { done, value } = await lector.read();
          if (done) break;
          trozosDeSalida.push(Buffer.from(value));
        }
      } else {
        trozosDeSalida.push(Buffer.from(await r.text(), 'utf8'));
      }
      respuesta.writeHead(r.status, cabeceras);
      respuesta.end(Buffer.concat(trozosDeSalida));
    } catch (e) {
      erroresDeEquipo.push(`${peticion.method ?? '?'} ${peticion.url ?? '?'}: ${String(e)}`);
      if (!respuesta.headersSent) respuesta.writeHead(500, { 'content-type': 'text/plain' });
      respuesta.end(String(e));
    }
  });
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  servidores.push(servidor);
  return servidor.address().port;
};

// ── Base propia ──────────────────────────────────────────────────────────────
const urlDe = (base, rol) => {
  const u = new URL(process.env.DATABASE_URL_PRUEBAS ?? '');
  u.pathname = `/${base}`;
  if (rol !== undefined) u.searchParams.set('options', `-c role=${rol}`);
  return u.toString();
};

/** Los mismos valores por omisión que `supabase/verificar.sh`: un solo servidor. */
const entornoDePsql = () => ({
  ...process.env,
  PGHOST: process.env.PGHOST ?? '/var/tmp/ncr/sock',
  PGPORT: process.env.PGPORT ?? '55432',
  PGUSER: process.env.PGUSER ?? 'postgres',
});

/** Huella de lo que construye la plantilla: migraciones y semillas, por contenido. */
const huellaDelEsquema = () => {
  const h = createHash('sha256');
  for (const dir of ['supabase/migrations', 'supabase/seed']) {
    for (const f of readdirSync(resolve(raiz, dir)).sort()) {
      if (!f.endsWith('.sql')) continue;
      h.update(f).update(readFileSync(resolve(raiz, dir, f)));
    }
  }
  return `ncr-esquema-${h.digest('hex').slice(0, 32)}`;
};

/** El número de portero de una cuenta, leído de la copia del recorrido. */
const numeroDelPortero = (correo) =>
  spawnSync(
    'psql',
    [
      '-d',
      BASE,
      '-Atqc',
      `SELECT numero_de_portero FROM public.usuarios WHERE lower(correo::text) = lower('${correo.replace(/'/g, "''")}')`,
    ],
    { encoding: 'utf8', env: entornoDePsql() },
  ).stdout.trim();

const prepararBase = () => {
  // La plantilla se migra y siembra UNA vez; cada recorrido parte de una copia
  // recién hecha, así que ni hereda lo que dejó el anterior ni ensucia la base
  // de la suite.
  const psql = (sql) =>
    spawnSync('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atqc', sql], {
      encoding: 'utf8',
      env: entornoDePsql(),
    });
  /**
   * 15-L · la plantilla lleva la HUELLA de las migraciones y semillas con que
   * se hizo, y se rehace si cambian. Antes bastaba con que existiera: con una
   * migración nueva (la 0042), el recorrido corría contra un esquema viejo y
   * fallaba por algo que no era la consola.
   */
  const huella = huellaDelEsquema();
  const existe = psql(
    `SELECT coalesce(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname = '${BASE_PLANTILLA}'`,
  );
  if (existe.status !== 0) {
    throw new Error(`psql no alcanza la base de pruebas: ${existe.stderr.trim()}`);
  }
  if (existe.stdout.trim() !== huella || process.env.NCR_RECREAR_PLANTILLA === '1') {
    const r = spawnSync('bash', ['supabase/verificar.sh', '--con-semillas', '--modo-supabase'], {
      cwd: raiz,
      encoding: 'utf8',
      env: { ...entornoDePsql(), PGDATABASE: BASE_PLANTILLA },
    });
    writeFileSync('/tmp/ncr-recorrido-base.log', `${r.stdout}${r.stderr}`);
    if (r.status !== 0)
      throw new Error('no se pudo migrar la base (ver /tmp/ncr-recorrido-base.log)');
    const marca = psql(`COMMENT ON DATABASE ${BASE_PLANTILLA} IS '${huella}'`);
    if (marca.status !== 0)
      throw new Error(`no se pudo marcar la plantilla: ${marca.stderr.trim()}`);
  }
  // Dos órdenes separadas: `psql -c` con varias sentencias las mete en UNA
  // transacción, y ni DROP ni CREATE DATABASE se admiten dentro de una.
  for (const sql of [
    `DROP DATABASE IF EXISTS ${BASE}`,
    `CREATE DATABASE ${BASE} TEMPLATE ${BASE_PLANTILLA} OWNER ${DUENO_SIMULADO}`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROL_DE_LA_API}') THEN
         CREATE ROLE ${ROL_DE_LA_API} NOLOGIN NOSUPERUSER BYPASSRLS INHERIT;
       END IF;
     END $$`,
    `GRANT ${DUENO_SIMULADO} TO ${ROL_DE_LA_API}`,
    `GRANT ${ROL_DE_LA_API} TO CURRENT_USER`,
  ]) {
    const r = psql(sql);
    if (r.status !== 0) throw new Error(`no se pudo copiar la plantilla: ${r.stderr.trim()}`);
  }
};

// ── API y consola ───────────────────────────────────────────────────────────
const arrancarApi = (doble, puerto, puertoWeb) => {
  const cwd = resolve(raizApi, 'apps/api');
  const url = urlDe(BASE, ROL_DE_LA_API);
  const entorno = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(puerto),
    SUPABASE_URL: doble.url,
    SUPABASE_PUBLISHABLE_KEY: 'publicable-de-prueba',
    SUPABASE_SECRET_KEY: 'secreta-de-prueba',
    SUPABASE_JWKS_URL: doble.jwksUrl,
    DATABASE_URL: url,
    DATABASE_POOLER_URL: url,
    PERSISTENCIA_DE_EVENTOS: 'postgres',
    /**
     * Anexo 15-K · el adaptador REAL (`HikvisionProvider`) hablando Digest por
     * HTTP con los equipos simulados. Con `simulado` las órdenes las atendía el
     * MockProvider y nunca llegaban al equipo: H-SITIO-13 y 15 no se podían ver.
     */
    PROVEEDOR_DE_EQUIPOS: 'hikvision', // kpi-11-exento: nombre del adaptador, no del protocolo
    INGESTA_FIRMA_SECRETO: SECRETO_DE_INGESTA,
    BIOMETRIA_LLAVE: 'llave-de-biometria-para-el-recorrido-32+',
    BIOMETRIA_LLAVE_REF: 'env:BIOMETRIA_LLAVE',
    EQUIPOS_LLAVE: 'llave-de-equipos-para-el-recorrido-32+++',
    EQUIPOS_LLAVE_REF: 'env:EQUIPOS_LLAVE',
    CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${String(puertoWeb)}`,
    PLANIFICADOR_HABILITADO: 'false',
  };
  if (!existsSync(resolve(cwd, 'dist/main.js'))) {
    console.log('   · compilando la API (no hay dist)');
    const b = spawnSync('pnpm', ['--filter', '@ncr/api...', 'build'], { cwd: raizApi });
    if (b.status !== 0) throw new Error('no compila la API');
  }
  return lanzar('node', ['dist/main.js'], { cwd, env: entorno, detached: true, nombre: 'api' });
};

const arrancarConsola = (doble, puertoApi, puertoWeb) => {
  const cwd = resolve(raizWeb, 'apps/web');
  const binDeNext = resolve(
    dirname(createRequire(resolve(cwd, 'package.json')).resolve('next/package.json')),
    'dist/bin/next',
  );
  const entorno = {
    ...process.env,
    NODE_ENV: 'production',
    API_URL: `http://127.0.0.1:${String(puertoApi)}`,
    SUPABASE_URL: doble.url,
    SUPABASE_PUBLISHABLE_KEY: 'publicable-de-prueba',
  };
  const reutilizar =
    process.env.NCR_REUTILIZAR_CONSOLA === '1' && existsSync(resolve(cwd, '.next/BUILD_ID'));
  if (!reutilizar) {
    console.log('   · compilando la consola');
    const b = spawnSync('node', [binDeNext, 'build'], { cwd, env: entorno, encoding: 'utf8' });
    if (b.status !== 0) {
      writeFileSync('/tmp/ncr-recorrido-build-web.log', `${b.stdout}${b.stderr}`);
      throw new Error('no compila la consola (ver /tmp/ncr-recorrido-build-web.log)');
    }
  }
  // 15-L (H6) · el servidor de PRODUCCIÓN de la consola, que fija la IP del
  // navegador en `X-Forwarded-For`; `next start` a secas se la dejaría poner a él.
  return lanzar('node', ['servidor.mjs', '-H', '127.0.0.1', '-p', String(puertoWeb)], {
    cwd,
    env: entorno,
    detached: true,
    nombre: 'web',
  });
};

/** El Edge firma lo que ingesta; el recorrido firma con el secreto de SU API. */
const ingestarLectura = async (puertoApi, dispositivoId, placa) =>
  ingestar(puertoApi, { dispositivoId, metodo: 'placa', placaLeida: placa });

/** Un evento del Edge, firmado como lo firma él. */
const ingestar = async (puertoApi, evento) => {
  const cuerpo = JSON.stringify({
    copropiedadId: MIRA,
    confianzaCentesimas: 97,
    referenciaExterna: `recorrido-${randomUUID()}`,
    ...evento,
  });
  const marca = String(Math.floor(Date.now() / 1000));
  const firma = createHmac('sha256', SECRETO_DE_INGESTA).update(`${marca}.${cuerpo}`).digest('hex');
  const r = await fetch(`http://127.0.0.1:${String(puertoApi)}/ingesta/eventos`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ncr-firma': firma,
      'x-ncr-marca-temporal': marca,
    },
    body: cuerpo,
  });
  return r.status;
};

// ── El navegador ─────────────────────────────────────────────────────────────
const vigilar = (pagina, registro) => {
  pagina.on('response', (r) => {
    if (!r.url().includes('/api/') || r.status() < 400) return;
    // Un evento SIN foto contesta 404 a propósito y la consola lo pinta como
    // «Este evento no trae evidencia fotográfica»: no es un fallo.
    if (r.status() === 404 && /\/eventos\/[^/]+\/evidencia$/.test(new URL(r.url()).pathname)) {
      return;
    }
    // El recorrido no levanta go2rtc (el vídeo no es lo que mide): la vista en
    // vivo de Guardia contesta 503 «puente de vídeo no disponible», como en el
    // ensayo V3. En macOS Chromium la pide y en Linux no; no es un fallo.
    if (r.status() === 503 && /\/guardia\/video\/[^/]+\/whep$/.test(new URL(r.url()).pathname)) {
      return;
    }
    registro.push(`${String(r.status())} ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
};

const entrarConFactorNuevo = async (pagina, base, usuario) => {
  await pagina.goto(`${base}/acceso`, { waitUntil: 'networkidle' });
  await pagina.fill('input[name="correo"]', usuario.correo);
  await pagina.fill('input[name="contrasena"]', usuario.contrasena);
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('text=Configura tu segundo factor', { timeout: 30_000 });
  await pagina.click('text=¿No puedes escanear?');
  const secreto = (await pagina.locator('p.font-mono').first().innerText()).replace(/\s+/g, '');
  await pagina.fill('input[name="codigo"]', authenticator.generate(secreto));
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('text=Guarda tus códigos de recuperación', { timeout: 30_000 });
  await pagina.locator('ul li').nth(9).waitFor({ timeout: 30_000 });
  await pagina.check('input[type="checkbox"]');
  await pagina.click('text=Entrar a la consola');
  await pagina.waitForURL(/\/tablero/, { timeout: 30_000 });
};

const filaDe = (pagina, nombre) => pagina.locator('tr', { hasText: nombre }).first();

const altaDeEquipo = async (pagina, datos) => {
  await pagina.getByRole('button', { name: '+ Agregar equipo' }).click();
  const dialogo = pagina.getByRole('dialog');
  await dialogo.getByLabel('Nombre del equipo').fill(datos.nombre);
  if (datos.tipo !== undefined) await dialogo.locator('#tipo-de-equipo').selectOption(datos.tipo);
  await dialogo.getByLabel('Dirección del equipo').fill('127.0.0.1');
  await dialogo.getByLabel('Puerto').fill(String(datos.puerto));
  await dialogo.getByLabel('Usuario del equipo').fill(datos.usuario);
  await dialogo.getByLabel('Clave del equipo').fill(datos.clave);
  await dialogo.getByRole('button', { name: 'Probar conexión' }).click();
  await dialogo.getByRole('status').first().waitFor({ timeout: 30_000 });
  const guardado = pagina.waitForResponse(
    (r) => r.request().method() === 'POST' && /\/equipos$/.test(new URL(r.url()).pathname),
    { timeout: 30_000 },
  );
  await dialogo.locator('button[type="submit"]').click();
  const r = await guardado;
  return { estado: r.status(), cuerpo: await r.json().catch(() => ({})) };
};

const ordenarConMotivo = async (pagina, motivo) => {
  await pagina.getByRole('button', { name: 'Abrir con motivo' }).first().click();
  await pagina.locator('textarea#motivo').fill(motivo);
  await pagina.getByRole('button', { name: 'Abrir', exact: true }).click();
  await pagina
    .getByText(/Última orden:/)
    .first()
    .waitFor({ timeout: 30_000 });
};

/** Hora de Bogotá, que es la de la copropiedad sembrada: el turno se escribe en ella. */
const enBogota = (fecha) => {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(fecha)
      .map((p) => [p.type, p.value]),
  );
  return {
    dia: `${partes.year}-${partes.month}-${partes.day}`,
    hora: `${partes.hour}:${partes.minute}`,
  };
};

const principal = async () => {
  paso('0 · Chromium y base de pruebas');
  const ejecutable = chromiumDelEntorno();
  const sinBase =
    process.env.DATABASE_URL_PRUEBAS === undefined || process.env.DATABASE_URL_PRUEBAS === '';
  // Las DOS faltas se dicen, no sólo la primera: en el CI de «controles» no
  // hay ni Chromium ni base, y la prueba negativa de la base esperaba su
  // mensaje y recibía el del navegador (el CI de la 15-K lo destapó).
  if (ejecutable === null) mal('no hay Chromium: el recorrido de la consola NO se ha verificado');
  if (sinBase) {
    mal('sin DATABASE_URL_PRUEBAS no hay base: el recorrido de la consola NO se ha verificado');
  }
  if (ejecutable === null || sinBase) return;
  prepararBase();
  ok(`base ${BASE} recién copiada de la plantilla migrada y sembrada`);

  paso('1 · equipos simulados por HTTP, con Digest');
  const claveCamara = randomBytes(9).toString('base64url');
  const claveTerminal = randomBytes(9).toString('base64url');
  const puertoCamara = await equipoPorHttp({
    familia: 'camara',
    usuario: 'servicio',
    clave: claveCamara,
    destino: CAMARA_SIMULADA,
    ctrlMod: '0',
    modelo: 'CAMARA-SIMULADA',
    firmware: 'V5.3.0 build 220101',
  });
  const puertoTerminal = await equipoPorHttp({
    familia: 'terminal',
    usuario: 'servicio',
    clave: claveTerminal,
    destino: TERMINAL_SIMULADA,
    verificacionRemota: true,
    modelo: 'TERMINAL-SIMULADA',
    firmware: 'V3.2.0',
  });
  ok(`cámara en :${String(puertoCamara)} (decide sola) y terminal en :${String(puertoTerminal)}`);

  paso('2 · doble de GoTrue con el gancho de claims REAL de la base');
  const lectura = new Pool({ connectionString: urlDe(BASE), max: 2 });
  const doble = await arrarcarDoble(lectura);
  ok(`escuchando en ${doble.url}`);

  const puertoApi = await puertoLibre();
  const puertoWeb = await puertoLibre();
  paso('3 · API real sobre la base propia, con el adaptador real contra los equipos simulados');
  const api = arrancarApi(doble, puertoApi, puertoWeb);
  if (!(await esperar(`http://127.0.0.1:${String(puertoApi)}/health`, 'la API'))) return;
  afirmar(
    /proveedor de equipos activo: hikvision/.test(api.salida.join('')), // kpi-11-exento: nombre del adaptador
    'la API arranca con el adaptador REAL: las órdenes viajan por HTTP y Digest a los equipos simulados',
  );

  paso('4 · consola compilada');
  arrancarConsola(doble, puertoApi, puertoWeb);
  const base = `http://127.0.0.1:${String(puertoWeb)}`;
  if (!(await esperar(`${base}/acceso`, 'la consola'))) return;
  ok(`consola en ${base}`);

  const navegador = await chromium.launch(
    ejecutable === undefined ? {} : { executablePath: ejecutable },
  );
  try {
    const admin = await recorridoDelSuperadministrador(navegador, base, puertoApi, {
      puertoCamara,
      claveCamara,
      puertoTerminal,
      claveTerminal,
    });
    const portero = await recorridoDelPortero(navegador, base);
    await visitaConFoto(admin, portero, base);
    await eventosVisibles(admin.pagina, base, admin.sufijo);
    await sinTextoTecnico({ superadministrador: admin.pagina, portero: portero.pagina }, base);
    afirmar(
      admin.malas.length === 0,
      `ninguna petición del superadministrador falló (${admin.malas.join(', ') || 'ninguna'})`,
    );
    afirmar(
      portero.malas.length === 0,
      `ninguna petición del portero falló (${portero.malas.join(', ') || 'ninguna'})`,
    );
    await admin.contexto.close();
    await portero.contexto.close();
    /**
     * H-SITIO-15 · al FINAL, no tras la puerta: así cuenta también las
     * escrituras de la sincronización de la plantilla (persona y rostro) y la
     * orden del portero. Lo dice el equipo, que es quien las rechaza.
     */
    const vacias =
      (escriturasSinCuerpoPor.get(TERMINAL_SIMULADA) ?? 0) +
      (escriturasSinCuerpoPor.get(CAMARA_SIMULADA) ?? 0);
    afirmar(
      vacias === 0,
      `H-SITIO-15 · ninguna escritura llegó a los equipos con el cuerpo vacío (${String(vacias)} rechazadas con badXmlContent)`,
    );
  } finally {
    await navegador.close();
    await lectura.end();
    await doble.cerrar();
  }
  volcar();
};

const arrarcarDoble = (lectura) =>
  arrancarDobleGotrue({
    usuarios: [SUPERADMIN, PORTERO],
    /**
     * Lo que hace Supabase: llamar al gancho con el evento y usar los claims
     * que devuelve. Se le pasan SIN rol ni copropiedad: si la base no conoce
     * al usuario, el token sale sin ellos y la API falla cerrada, que es lo
     * que haría en producción.
     */
    claimsDe: async (authUserId, { rol, usuario_id, copropiedad_id, copropiedades, ...base }) => {
      const { rows } = await lectura.query(
        'SELECT public.custom_access_token_hook($1::jsonb) AS r',
        [JSON.stringify({ user_id: authUserId, claims: base, authentication_method: 'password' })],
      );
      return rows[0]?.r?.claims ?? base;
    },
  });

/** Ficha: diagnóstico, corrección del modo de control y nuevo diagnóstico. */
const diagnosticarYCorregir = async (pagina, camara) => {
  // C3 (15-L) · el botón que abre la ficha se llama «Probar conexión»: la ficha
  // SONDEA el equipo. El recorrido buscaba «Ficha» y se quedó esperando.
  await filaDe(pagina, camara).getByRole('button', { name: 'Probar conexión' }).click();
  const dialogo = pagina.getByRole('dialog', { name: new RegExp(`Ficha de ${camara}`) });
  const hallazgo = dialogo.locator('li', { hasText: 'quién decide · modo de control' }).first();
  await hallazgo.waitFor({ timeout: 30_000 });
  afirmar(/Impide operar/.test(await hallazgo.innerText()), 'el diagnóstico ve el modo de control');
  await dialogo
    .getByLabel('Motivo de la corrección')
    .fill('Puesta en marcha del recorrido de la consola');
  await hallazgo.getByRole('button', { name: 'Corregirlo en el equipo' }).click();
  await dialogo.getByText(/Antes: 0 → ahora: 1/).waitFor({ timeout: 30_000 });
  ok('la corrección se aplica en el equipo y dice el valor anterior y el nuevo');
  // El diálogo vuelve a sondear solo: lo que enseña ahora es lo que el equipo dice.
  const conforme = await dialogo
    .locator('li', { hasText: 'Correcto · quién decide la apertura' })
    .first()
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  afirmar(conforme, 'el nuevo diagnóstico ya no bloquea: quién decide la apertura es correcto');
  await pagina.keyboard.press('Escape');
};

const recorridoDelSuperadministrador = async (navegador, base, puertoApi, equipos) => {
  const contexto = await navegador.newContext({ viewport: { width: 1360, height: 900 } });
  const pagina = await contexto.newPage();
  const malas = [];
  vigilar(pagina, malas);
  const sufijo = randomBytes(2).toString('hex');
  const camara = `Cámara del recorrido ${sufijo}`;
  const terminal = `Terminal del recorrido ${sufijo}`;
  let camaraId = null;
  let terminalId = null;

  paso('5 · superadministrador: acceso con segundo factor y copropiedad');
  try {
    await entrarConFactorNuevo(pagina, base, SUPERADMIN);
  } catch (e) {
    const texto = (
      await pagina
        .locator('body')
        .innerText()
        .catch(() => '')
    ).replace(/\s+/g, ' ');
    mal(`el superadministrador no llega al tablero en ${pagina.url()}: ${texto.slice(0, 300)}`);
    throw e;
  }
  ok('entra al tablero con aal2');
  // Se ESPERA a que la cookie de la copropiedad quede puesta: sin esto, la
  // primera alta caía en la copropiedad anterior (la primera del catálogo).
  const cambio = pagina.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/sesion/copropiedad' && r.ok(),
    { timeout: 30_000 },
  );
  await pagina.locator('#selector-copropiedad').selectOption(MIRA);
  await cambio;
  await pagina.goto(`${base}/tablero`, { waitUntil: 'networkidle' });
  afirmar(
    (await pagina.locator('#selector-copropiedad').inputValue()) === MIRA,
    'trabaja sobre la copropiedad sembrada del portero',
  );

  paso('6 · Dispositivos: alta de la cámara y la terminal');
  await bloque('alta de la cámara', async () => {
    await pagina.goto(`${base}/dispositivos`, { waitUntil: 'networkidle' });
    const alta = await altaDeEquipo(pagina, {
      nombre: camara,
      puerto: equipos.puertoCamara,
      usuario: 'servicio',
      clave: equipos.claveCamara,
    });
    afirmar(alta.estado === 201, `el alta de la cámara se guarda (${String(alta.estado)})`);
    camaraId = alta.cuerpo.id ?? null;
    afirmar(
      alta.cuerpo.verificacion === 'rechazado',
      `H-SITIO-01 · la cámara que decide sola queda «rechazada» (${String(alta.cuerpo.verificacion)})`,
    );
    await pagina.reload({ waitUntil: 'networkidle' });
    const visible = await filaDe(pagina, camara)
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    afirmar(visible, 'H-SITIO-02 · el equipo dado de alta aparece en la tabla de Dispositivos');
  });
  await bloque('alta de la terminal', async () => {
    const alta = await altaDeEquipo(pagina, {
      nombre: terminal,
      tipo: 'terminal_facial',
      puerto: equipos.puertoTerminal,
      usuario: 'servicio',
      clave: equipos.claveTerminal,
    });
    terminalId = alta.cuerpo.id ?? null;
    afirmar(
      alta.estado === 201 && alta.cuerpo.capacidades?.bibliotecaDeRostros?.estado === 'si',
      'la terminal se da de alta y declara biblioteca de rostros',
    );
  });

  paso('7 · Ficha: diagnóstico y corrección en el equipo');
  await bloque('diagnóstico y corrección', async () => {
    try {
      await diagnosticarYCorregir(pagina, camara);
    } catch (e) {
      const texto = await pagina
        .getByRole('dialog')
        .first()
        .innerText()
        .catch(() => '(sin diálogo)');
      console.log(`     · el diálogo decía: ${texto.replace(/\s+/g, ' ').slice(0, 600)}`);
      await pagina.keyboard.press('Escape');
      throw e;
    }
  });
  paso('8 · Editar: la edición viaja por PUT');
  await bloque('edición', async () => {
    await filaDe(pagina, camara).getByRole('button', { name: 'Editar' }).click();
    const dialogo = pagina.getByRole('dialog');
    await dialogo.getByLabel('Nombre del equipo').fill(`${camara} editada`);
    const guardado = pagina.waitForResponse(
      (r) => r.request().method() === 'PUT' && /\/equipos\//.test(new URL(r.url()).pathname),
      { timeout: 30_000 },
    );
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();
    const r = await guardado;
    const cuerpo = await r.json().catch(() => ({}));
    afirmar(r.status() === 200, `H-SITIO-08 · la edición (PUT) se guarda (${String(r.status())})`);
    afirmar(
      cuerpo.verificacion === 'verificado',
      `corregida y re-sondeada al guardar, la cámara queda verificada (${String(cuerpo.verificacion)})`,
    );
  });

  paso('9 · Portería y Guardia virtual: apertura con motivo, en el historial');
  await bloque('lectura de placa por la ingesta firmada', async () => {
    if (camaraId === null) throw new Error('no hay cámara dada de alta');
    const estado = await ingestarLectura(puertoApi, camaraId, `R${sufijo.toUpperCase()}99`);
    afirmar(estado === 202, `la API recibe la lectura firmada del Edge (${String(estado)})`);
  });
  await bloque('orden desde Portería', async () => {
    await pagina.goto(`${base}/porteria`, { waitUntil: 'networkidle' });
    await ordenarConMotivo(pagina, 'Recorrido: visitante esperado, confirmado por teléfono');
    afirmar(
      await pagina
        .getByText('Recorrido: visitante esperado, confirmado por teléfono')
        .first()
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false),
      'la orden de Portería aparece en «Historial inmediato» con su motivo',
    );
    const ultima = await pagina
      .getByText(/Última orden:/)
      .first()
      .innerText();
    afirmar(!/Abierta/i.test(ultima), `la consola no dice «abierta» (${ultima.trim()})`);
  });
  await bloque('orden desde Guardia virtual', async () => {
    await pagina.goto(`${base}/guardia`, { waitUntil: 'networkidle' });
    await pagina
      .getByRole('button', { name: new RegExp(`R${sufijo.toUpperCase()}99`) })
      .first()
      .click();
    await ordenarConMotivo(pagina, 'Recorrido: apertura remota desde la central');
    ok('la orden de Guardia virtual deja su «Última orden»');
  });
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ANEXO 15-K · LA PUERTA DE LA TERMINAL, Y LO QUE HIZO EL EQUIPO
   *
   * Hasta aquí las órdenes iban a la barrera de la cámara, y la puerta de la
   * terminal —donde en sitio el «OK» no movió nada (H-SITIO-13)— no la cruzaba
   * nadie. Un evento facial de la terminal sube a la cola (motivo crítico) y
   * se abre desde Portería. La consola dice «aceptada» también cuando el relé
   * no se mueve, así que el veredicto no sale de la pantalla: sale del EQUIPO
   * simulado, que sabe si accionó. Si le llegó una escritura vacía (H-SITIO-15)
   * se cuenta al final del recorrido, con todas las escrituras dentro.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  const abiertasAntes = aperturasFisicasPor.get(TERMINAL_SIMULADA) ?? 0;
  await bloque('la puerta de la terminal, desde Portería', async () => {
    if (terminalId === null) throw new Error('no hay terminal dada de alta');
    const estado = await ingestar(puertoApi, { dispositivoId: terminalId, metodo: 'facial' });
    afirmar(estado === 202, `la API recibe el evento facial de la terminal (${String(estado)})`);
    await pagina.goto(`${base}/porteria`, { waitUntil: 'networkidle' });
    await ordenarConMotivo(pagina, 'Recorrido: la puerta de la terminal, con motivo');
  });
  afirmar(
    (aperturasFisicasPor.get(TERMINAL_SIMULADA) ?? 0) > abiertasAntes,
    'H-SITIO-13 · la orden llega a la terminal y su PUERTA se mueve: lo dice el equipo, no la consola',
  );

  paso('10 · Porteros: el superadministrador asigna un turno que cubre ahora');
  await bloque('turno', async () => {
    await pagina.goto(`${base}/porteros`, { waitUntil: 'networkidle' });
    await pagina.getByRole('button', { name: 'Asignar turno' }).click();
    const dialogo = pagina.getByRole('dialog');
    const desde = enBogota(new Date(Date.now() - 30 * 60_000));
    const hasta = enBogota(new Date(Date.now() + 90 * 60_000));
    await dialogo.getByLabel('Día').fill(desde.dia);
    await dialogo.getByLabel('Desde').fill(desde.hora);
    await dialogo.getByLabel('Hasta').fill(hasta.hora);
    const guardado = pagina.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/turnos$/.test(new URL(r.url()).pathname),
      { timeout: 30_000 },
    );
    await dialogo.getByRole('button', { name: 'Asignar' }).click();
    const r = await guardado;
    afirmar(r.status() === 201, `el turno del portero se guarda (${String(r.status())})`);
  });

  return { contexto, pagina, malas, sufijo, terminal };
};

const recorridoDelPortero = async (navegador, base) => {
  const contexto = await navegador.newContext({ viewport: { width: 1360, height: 900 } });
  const pagina = await contexto.newPage();
  const malas = [];
  vigilar(pagina, malas);

  paso('11 · portero: entra en su turno con su número y abre con motivo');
  await bloque('acceso del portero', async () => {
    await pagina.goto(`${base}/acceso`, { waitUntil: 'networkidle' });
    // H3 (15-L, ADR-031) · el portero entra con su NÚMERO: la 0042 se lo dio al
    // sembrado, que era una cuenta por correo. Sin código ni NIT.
    const numero = numeroDelPortero(PORTERO.correo);
    afirmar(/^\d{4,}$/.test(numero), `el portero sembrado tiene número (${numero || 'ninguno'})`);
    await pagina.fill('input[name="correo"]', numero);
    afirmar(
      (await pagina.locator('input[name="copropiedad"]').count()) === 0,
      'con un número, la consola no pide el código de la copropiedad',
    );
    await pagina.fill('input[name="contrasena"]', PORTERO.contrasena);
    await pagina.click('button[type="submit"]');
    await pagina.waitForURL((u) => !u.pathname.startsWith('/acceso'), { timeout: 30_000 });
    ok('el portero entra dentro de su turno, sin segundo factor');
  });
  await bloque('apertura del portero', async () => {
    await pagina.goto(`${base}/porteria`, { waitUntil: 'networkidle' });
    await ordenarConMotivo(
      pagina,
      'Recorrido: residente sin credencial, identificado por documento',
    );
    afirmar(
      await pagina
        .getByText('Recorrido: residente sin credencial, identificado por documento')
        .first()
        .waitFor({ timeout: 20_000 })
        .then(() => true)
        .catch(() => false),
      'la apertura del portero queda en su «Historial inmediato»',
    );
  });
  return { contexto, pagina, malas };
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * F (15-L) · LA VISITA DE LA ENTREGA, CON LOS DOS ROLES A LA VEZ
 *
 * El superadministrador genera la autorización con foto y casilla (F1, F4);
 * nace vigente (F2); la foto llega a la terminal (F3). El portero, con su
 * pantalla abierta, recibe el aviso sin recargar y la rechaza con motivo: la
 * autorización queda anulada y la foto SALE de la terminal. Lo de la terminal
 * no lo dice la consola: lo dice el equipo simulado, que guarda las personas
 * que de verdad le escribieron y le borraron.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const visitaConFoto = async (admin, portero, base) => {
  const nombre = `Visitante del recorrido ${admin.sufijo}`;
  const documento = `9${String(Date.now()).slice(-8)}`;
  // La biblioteca de rostros de la terminal simulada: la plantilla de esta
  // visita es la que aparece al generarla.
  const claves = () => new Set(plantillasPor.get(TERMINAL_SIMULADA) ?? []);
  const antes = claves();
  let nuevas = [];
  let generada = false;

  paso('12 · Visitantes: el superadministrador genera la autorización con foto y casilla');
  // El portero espera en SU pantalla de visitas, con el canal en vivo abierto.
  await bloque('el portero con la pantalla abierta', async () => {
    // Un flujo de eventos no «responde» hasta que se cierra: se espera la PETICIÓN.
    const canal = portero.pagina.waitForRequest(
      (r) => /\/api\/ncr\/copropiedades\/[^/]+\/eventos\/flujo$/.test(new URL(r.url()).pathname),
      { timeout: 30_000 },
    );
    await portero.pagina.goto(`${base}/visitantes`, { waitUntil: 'domcontentloaded' });
    await canal;
    ok('el portero tiene abierta «Visitantes» y su canal en vivo');
  });
  await bloque('generar autorización', async () => {
    const pagina = admin.pagina;
    await pagina.goto(`${base}/visitantes`, { waitUntil: 'networkidle' });
    await pagina.getByRole('button', { name: 'Generar autorización' }).click();
    const dialogo = pagina.getByRole('dialog');
    await dialogo.getByLabel('Nombre del visitante').fill(nombre);
    await dialogo.getByLabel('Número de documento').fill(documento);
    const vivienda = dialogo.locator('select[name="viviendaId"]');
    await vivienda.locator('option').nth(1).waitFor({ state: 'attached', timeout: 20_000 });
    await vivienda.selectOption({ index: 1 });
    await dialogo.getByLabel('Foto frontal del visitante').setInputFiles({
      name: 'visitante.png',
      mimeType: 'image/png',
      buffer: pngSintetico(),
    });
    // Chromium sin detector de rostros pide la confirmación del encuadre.
    const encuadre = dialogo.getByText(/Este navegador no cuenta rostros/);
    await dialogo
      .getByText(/Este navegador no cuenta rostros|La foto sirve/)
      .first()
      .waitFor({ timeout: 20_000 });
    if (await encuadre.isVisible()) await encuadre.click();
    await dialogo.getByText('La foto sirve').waitFor({ timeout: 20_000 });
    const enviar = dialogo.getByRole('button', { name: 'Generar autorización' });
    afirmar(
      await enviar.isDisabled(),
      'F4 · sin la casilla marcada el formulario no deja generar la autorización',
    );
    await dialogo.locator('input[name="casilla"]').check();
    const respuesta = pagina.waitForResponse(
      (r) => r.request().method() === 'POST' && /\/visitas$/.test(new URL(r.url()).pathname),
      { timeout: 60_000 },
    );
    await enviar.click();
    const r = await respuesta;
    const cuerpo = await r.json().catch(() => ({}));
    generada = r.ok() && cuerpo.generada === true;
    afirmar(
      generada,
      `H-SITIO-03 · el superadministrador genera la autorización con foto (${String(r.status())})`,
    );
    await dialogo.getByText('Autorización generada.').waitFor({ timeout: 20_000 });
    const resumen = (await dialogo.getByRole('status').first().innerText()).replace(/\s+/g, ' ');
    afirmar(
      /Foto enviada a 1 de 1 equipos/.test(resumen),
      `F3 · la consola dice a cuántos equipos llegó la foto (${resumen.slice(0, 120)})`,
    );
    nuevas = [...claves()].filter((k) => !antes.has(k));
    afirmar(
      nuevas.length === 1,
      `F3 · la foto está en la biblioteca de la TERMINAL: lo dice el equipo (${String(nuevas.length)} nueva)`,
    );
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    const tarjeta = pagina
      .getByRole('list', { name: 'Visitas' })
      .locator('li', { hasText: nombre });
    await tarjeta.first().waitFor({ timeout: 20_000 });
    afirmar(
      /Vigente/.test(await tarjeta.first().innerText()),
      'F2 · la visita nace VIGENTE, sin que nadie la apruebe',
    );
    await tarjeta.first().getByRole('button', { name: 'Ver detalle' }).click();
    const enEquipo = tarjeta.first().locator('li', { hasText: admin.terminal });
    await enEquipo.waitFor({ timeout: 20_000 });
    afirmar(
      /La tiene/.test(await enEquipo.innerText()),
      'F3 · el detalle dice, equipo por equipo, que la terminal tiene la foto',
    );
  });

  paso('13 · el portero recibe el aviso en su pantalla, sin recargar');
  let aviso = null;
  await bloque('aviso al portero', async () => {
    if (!generada) throw new Error('no hay visita generada');
    aviso = portero.pagina.getByRole('alertdialog', { name: /Nueva visita para/ });
    await aviso.waitFor({ timeout: 20_000 });
    afirmar(
      (await aviso.innerText()).includes(nombre),
      'F2 · el aviso en vivo trae al visitante y dice que ya está autorizada',
    );
  });

  paso('14 · el portero la rechaza con motivo: anulada, y la foto sale de la terminal');
  await bloque('rechazo', async () => {
    if (aviso === null) throw new Error('no llegó el aviso');
    await aviso.getByRole('button', { name: 'Rechazar' }).click();
    await portero.pagina.locator('textarea#motivo').fill('Recorrido: el residente no la espera');
    await portero.pagina.getByRole('button', { name: 'Rechazar visita' }).click();
    const resumen = portero.pagina.getByText(/Visita rechazada\./).first();
    await resumen.waitFor({ timeout: 30_000 });
    afirmar(
      /La foto salió de 1 equipos\./.test(await resumen.innerText()),
      `F2 · el rechazo dice de cuántos equipos salió la foto (${(await resumen.innerText()).trim()})`,
    );
    const quedan = claves();
    afirmar(
      nuevas.length === 1 && nuevas.every((k) => !quedan.has(k)),
      'RN-11 · la foto ya NO está en la biblioteca de la terminal: el rechazo la suprimió',
    );
    // El superadministrador lo ve sin recargar: el mismo canal en vivo.
    const tarjeta = admin.pagina
      .getByRole('list', { name: 'Visitas' })
      .locator('li', { hasText: nombre })
      .first();
    const anulada = await tarjeta
      .getByText(/Anulada/)
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    afirmar(anulada, 'F2 · el superadministrador ve la visita ANULADA en su lista, en vivo');
    const portal = portero.pagina.getByRole('list', { name: 'Visitas' });
    afirmar(
      /Anulada/.test(await portal.locator('li', { hasText: nombre }).first().innerText()),
      'F5 · la lista del día del portero la muestra anulada, no la borra',
    );
  });
};

/** B (15-L) · lo que pasó en el recorrido está en «Eventos y alertas». */
const eventosVisibles = async (pagina, base, sufijo) => {
  paso('15 · Eventos y alertas: lo ocurrido en el recorrido se ve');
  await bloque('eventos', async () => {
    await pagina.goto(`${base}/eventos`, { waitUntil: 'networkidle' });
    const placa = `R${sufijo.toUpperCase()}99`;
    const visto = await pagina
      .getByText(placa)
      .first()
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    afirmar(visto, `la lectura de placa ${placa} del recorrido aparece en «Eventos y alertas»`);
    const linea = await pagina
      .getByText('Línea de tiempo')
      .first()
      .isVisible()
      .catch(() => false);
    afirmar(linea, 'la «Línea de tiempo» de lo que dijeron los equipos está en la pantalla');
  });
};

/**
 * I (15-L) · CERO TEXTO TÉCNICO, EN LA PANTALLA DE VERDAD.
 *
 * El patrón es el de la prueba del fuente (`apps/web/src/texto-visible.test.ts`),
 * leído de ella para que no se separen. Aquí se aplica a lo que la persona VE:
 * cada entrada de SU menú, con los datos del recorrido dentro —también lo que
 * llega de la API, que la prueba del fuente no alcanza—.
 */
const TEXTO_TECNICO = (() => {
  const fuente = readFileSync(resolve(raiz, 'apps/web/src/texto-visible.test.ts'), 'utf8');
  const m = /export const TEXTO_TECNICO =\s*\/(.+)\/;/.exec(fuente);
  if (m === null) throw new Error('no se encontró TEXTO_TECNICO en la prueba del fuente');
  return new RegExp(m[1]);
})();

const sinTextoTecnico = async (paginas, base) => {
  paso('16 · cero texto técnico en cada pantalla de cada rol');
  for (const [rol, pagina] of Object.entries(paginas)) {
    await bloque(`pantallas del ${rol}`, async () => {
      // `/` lleva a cada rol a SU pantalla de inicio: el portero, a Portería.
      await pagina.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
      const menu = pagina.getByRole('navigation', { name: 'Navegación principal' });
      await menu.locator('a[href^="/"]').first().waitFor({ timeout: 20_000 });
      const rutas = [
        ...new Set(
          await menu
            .locator('a[href^="/"]')
            .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? '')),
        ),
      ].filter((r) => r !== '');
      const hallazgos = [];
      for (const ruta of rutas) {
        await pagina.goto(`${base}${ruta}`, { waitUntil: 'networkidle' });
        const texto = await pagina.locator('body').innerText();
        const m = TEXTO_TECNICO.exec(texto);
        if (m !== null) {
          const i = Math.max(0, m.index - 40);
          hallazgos.push(`${ruta}: «…${texto.slice(i, m.index + 40).replace(/\s+/g, ' ')}…»`);
        }
      }
      afirmar(
        rutas.length > 0 && hallazgos.length === 0,
        `Bloque I · ${String(rutas.length)} pantallas del ${rol} sin códigos del proyecto${
          hallazgos.length > 0 ? `: ${hallazgos.join(' · ')}` : ''
        }`,
      );
    });
  }
};

principal()
  .catch((e) =>
    mal(`el recorrido no pudo completarse: ${e instanceof Error ? e.message : String(e)}`),
  )
  .finally(async () => {
    volcar();
    await cerrarTodo();
    for (const e of erroresDeEquipo.slice(0, 5)) console.log(`   · equipo simulado: ${e}`);
    console.log(
      fallos === 0
        ? '\nRECORRIDO DE LA CONSOLA: completo, contra la API real, PostgreSQL y el simulado'
        : `\nRECORRIDO DE LA CONSOLA: ${String(fallos)} comprobación(es) fallaron`,
    );
    process.exit(fallos === 0 ? 0 : 1);
  });
