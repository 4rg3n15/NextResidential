/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL ARNÉS DE LOS RECORRIDOS EN NAVEGADOR (15-Y1)
 *
 * Lo que `recorrido-de-consola.mjs` traía dentro y ahora comparte con el
 * recorrido del residente en la web: puertos libres, el Chromium del entorno,
 * procesos que se lanzan y se matan en bloque, la espera a que un servicio
 * responda, la base de pruebas copiada de una plantilla migrada y sembrada, y
 * la API y la consola de producción sobre esa base con el doble de GoTrue.
 *
 * Sacarlo aquí no cambia nada de lo que hacía: el recorrido de la consola lo
 * importa y sigue siendo el mismo recorrido (el paso 13b del verificador lo
 * demuestra). Lo que cambia es que un segundo recorrido no tiene que copiarlo.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

export const procesos = [];
export const servidores = [];

export const puertoLibre = () =>
  new Promise((listo) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => listo(port));
    });
  });

/** El Chromium preinstalado (`/opt/pw-browsers`), `undefined` si Playwright trae el suyo, `null` si no hay. */
export const chromiumDelEntorno = () => {
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

export const lanzar = (comando, args, opciones) => {
  const proceso = spawn(comando, args, { ...opciones, stdio: ['ignore', 'pipe', 'pipe'] });
  const salida = [];
  proceso.stdout.on('data', (d) => salida.push(String(d)));
  proceso.stderr.on('data', (d) => salida.push(String(d)));
  procesos.push({ proceso, salida, nombre: opciones.nombre ?? comando });
  return { proceso, salida };
};

let prefijoDeVolcado = 'ncr-recorrido';
/** El nombre con que este recorrido vuelca sus registros en /tmp (`ncr-recorrido-<nombre>-api.log`). */
export const nombrarVolcado = (prefijo) => {
  prefijoDeVolcado = prefijo;
};

export const volcar = (prefijo = prefijoDeVolcado) => {
  for (const { nombre, salida } of procesos) {
    writeFileSync(`/tmp/${prefijo}-${nombre}.log`, salida.join(''));
  }
  console.log(`   · salida completa en /tmp/${prefijo}-{api,web}.log`);
};

export const cerrarTodo = async () => {
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

export const esperar = async (url, etiqueta, mal, intentos = 120) => {
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

export const urlDe = (base, rol) => {
  const u = new URL(process.env.DATABASE_URL_PRUEBAS ?? '');
  u.pathname = `/${base}`;
  if (rol !== undefined) u.searchParams.set('options', `-c role=${rol}`);
  return u.toString();
};

/** Los mismos valores por omisión que `supabase/verificar.sh`: un solo servidor. */
export const entornoDePsql = () => ({
  ...process.env,
  PGHOST: process.env.PGHOST ?? '/var/tmp/ncr/sock',
  PGPORT: process.env.PGPORT ?? '55432',
  PGUSER: process.env.PGUSER ?? 'postgres',
});

/** Huella de lo que construye la plantilla: migraciones y semillas, por contenido. */
export const huellaDelEsquema = (raiz) => {
  const h = createHash('sha256');
  for (const dir of ['supabase/migrations', 'supabase/seed']) {
    for (const f of readdirSync(resolve(raiz, dir)).sort()) {
      if (!f.endsWith('.sql')) continue;
      h.update(f).update(readFileSync(resolve(raiz, dir, f)));
    }
  }
  return `ncr-esquema-${h.digest('hex').slice(0, 32)}`;
};

/**
 * La plantilla se migra y siembra UNA vez y lleva la HUELLA de con qué se hizo
 * (15-L: se rehace si cambian); cada recorrido parte de una copia recién hecha,
 * así que ni hereda lo que dejó el anterior ni ensucia la base de la suite.
 */
export const prepararBase = ({ raiz, base, plantilla, dueno, rolDeLaApi }) => {
  const psql = (sql) =>
    spawnSync('psql', ['-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atqc', sql], {
      encoding: 'utf8',
      env: entornoDePsql(),
    });
  const huella = huellaDelEsquema(raiz);
  const existe = psql(
    `SELECT coalesce(shobj_description(oid, 'pg_database'), '') FROM pg_database WHERE datname = '${plantilla}'`,
  );
  if (existe.status !== 0) {
    throw new Error(`psql no alcanza la base de pruebas: ${existe.stderr.trim()}`);
  }
  if (existe.stdout.trim() !== huella || process.env.NCR_RECREAR_PLANTILLA === '1') {
    const r = spawnSync('bash', ['supabase/verificar.sh', '--con-semillas', '--modo-supabase'], {
      cwd: raiz,
      encoding: 'utf8',
      env: { ...entornoDePsql(), PGDATABASE: plantilla },
    });
    writeFileSync('/tmp/ncr-recorrido-base.log', `${r.stdout}${r.stderr}`);
    if (r.status !== 0)
      throw new Error('no se pudo migrar la base (ver /tmp/ncr-recorrido-base.log)');
    const marca = psql(`COMMENT ON DATABASE ${plantilla} IS '${huella}'`);
    if (marca.status !== 0)
      throw new Error(`no se pudo marcar la plantilla: ${marca.stderr.trim()}`);
  }
  // Dos órdenes separadas: `psql -c` con varias sentencias las mete en UNA
  // transacción, y ni DROP ni CREATE DATABASE se admiten dentro de una.
  for (const sql of [
    `DROP DATABASE IF EXISTS ${base}`,
    `CREATE DATABASE ${base} TEMPLATE ${plantilla} OWNER ${dueno}`,
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${rolDeLaApi}') THEN
         CREATE ROLE ${rolDeLaApi} NOLOGIN NOSUPERUSER BYPASSRLS INHERIT;
       END IF;
     END $$`,
    `GRANT ${dueno} TO ${rolDeLaApi}`,
    `GRANT ${rolDeLaApi} TO CURRENT_USER`,
  ]) {
    const r = psql(sql);
    if (r.status !== 0) throw new Error(`no se pudo copiar la plantilla: ${r.stderr.trim()}`);
  }
};

/**
 * La API de producción (`dist/main.js`) sobre la base del recorrido, con el
 * doble de GoTrue como proveedor de identidad. `entorno` añade o sobrescribe
 * variables (el adaptador de equipos, el secreto de ingesta…).
 */
export const arrancarApi = ({
  raizApi,
  doble,
  puerto,
  puertoWeb,
  base,
  rolDeLaApi,
  entorno = {},
}) => {
  const cwd = resolve(raizApi, 'apps/api');
  const url = urlDe(base, rolDeLaApi);
  const variables = {
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
    BIOMETRIA_LLAVE: 'llave-de-biometria-para-el-recorrido-32+',
    BIOMETRIA_LLAVE_REF: 'env:BIOMETRIA_LLAVE',
    EQUIPOS_LLAVE: 'llave-de-equipos-para-el-recorrido-32+++',
    EQUIPOS_LLAVE_REF: 'env:EQUIPOS_LLAVE',
    CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${String(puertoWeb)}`,
    PLANIFICADOR_HABILITADO: 'false',
    ...entorno,
  };
  if (!existsSync(resolve(cwd, 'dist/main.js'))) {
    console.log('   · compilando la API (no hay dist)');
    const b = spawnSync('pnpm', ['--filter', '@ncr/api...', 'build'], { cwd: raizApi });
    if (b.status !== 0) throw new Error('no compila la API');
  }
  return lanzar('node', ['dist/main.js'], { cwd, env: variables, detached: true, nombre: 'api' });
};

/**
 * La consola compilada, con su servidor de PRODUCCIÓN (`servidor.mjs`, que
 * fija la IP del navegador en `X-Forwarded-For`, 15-L H6).
 * `NCR_REUTILIZAR_CONSOLA=1` no recompila si ya hay `.next/BUILD_ID`.
 */
export const arrancarConsola = ({ raizWeb, doble, puertoApi, puertoWeb }) => {
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
  return lanzar('node', ['servidor.mjs', '-H', '127.0.0.1', '-p', String(puertoWeb)], {
    cwd,
    env: entorno,
    detached: true,
    nombre: 'web',
  });
};

/**
 * Lo que hace Supabase: llamar al gancho con el evento y usar los claims que
 * devuelve. Se le pasan SIN rol ni copropiedad: si la base no conoce al
 * usuario, el token sale sin ellos y la API falla cerrada, como en producción.
 */
export const claimsDesdeLaBase =
  (lectura) =>
  async (authUserId, { rol, usuario_id, copropiedad_id, copropiedades, ...base }) => {
    const { rows } = await lectura.query('SELECT public.custom_access_token_hook($1::jsonb) AS r', [
      JSON.stringify({ user_id: authUserId, claims: base, authentication_method: 'password' }),
    ]);
    return rows[0]?.r?.claims ?? base;
  };
