/**
 * EL CAMINO COMPLETO, POR NAVEGADOR: usuario nuevo → contraseña → inscripción
 * del factor → **QR pintado de verdad** → verificación → `aal2` → códigos de
 * recuperación → `/tablero` cargando.
 *
 * Por qué existe, dicho sin rodeos: durante cuatro rondas se corrigió un
 * eslabón por vez —el gancho de claims, el arranque en frío, la carrera del
 * 503, el QR— y cada corrección destapó el siguiente. El motivo es que **nadie
 * había recorrido el camino entero**. `arranque-en-frio.sh` llega hasta «la API
 * acepta estos claims»; las pruebas de la consola usan dobles por módulo. Entre
 * las dos queda el intervalo donde vive el usuario, que es justo el que
 * describe DT-12.
 *
 * Lo que hace distinto a esto de una prueba más:
 *
 *  - Corre la API y la consola **de verdad**, como procesos, no montadas en
 *    memoria.
 *  - Habla con un doble de GoTrue que reproduce la semántica del proveedor
 *    real, incluidas las tres cosas que nos costaron una ronda cada una: no
 *    existe `GET /factors`, inscribir con `aal1` teniendo un factor verificado
 *    da `403 insufficient_aal`, y el `qr_code` viene como SVG en crudo.
 *  - Conduce **Chromium**. La comprobación del QR no es «la respuesta trae un
 *    QR» sino `naturalWidth > 0`: que el navegador lo decodificó y lo pintó.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { authenticator } from 'otplib';
import { arrancarDobleGotrue, USUARIO } from './doble-gotrue.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const procesos = [];
let fallos = 0;

const ok = (m) => console.log(`   ✓ ${m}`);
const mal = (m) => {
  console.log(`   ✗ ${m}`);
  fallos += 1;
};
const paso = (m) => console.log(`\n▸ ${m}`);

const afirmar = (condicion, mensaje) => (condicion ? ok(mensaje) : mal(mensaje));

const puertoLibre = () =>
  new Promise((listo) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => listo(port));
    });
  });

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
  mal(`${etiqueta} no llegó a responder en ${intentos}s`);
  // Sin esto el fallo era mudo —«no respondió» y ni una línea de por qué—, que
  // es el defecto que este camino existe para cazar, cometido aquí mismo.
  volcarProcesos();
  return false;
};

const volcarProcesos = () => {
  for (const { nombre, salida } of procesos) {
    const lineas = salida
      .join('')
      .split('\n')
      .filter((l) => l.trim() !== '')
      .slice(-8);
    console.log(`     --- ${nombre} ---`);
    for (const l of lineas) console.log(`     ${l}`);
  }
};

const lanzar = (comando, args, opciones) => {
  const proceso = spawn(comando, args, { ...opciones, stdio: ['ignore', 'pipe', 'pipe'] });
  const salida = [];
  proceso.stdout.on('data', (d) => salida.push(String(d)));
  proceso.stderr.on('data', (d) => salida.push(String(d)));
  procesos.push({ proceso, salida, nombre: opciones.nombre ?? comando });
  return proceso;
};

const cerrarTodo = () => {
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
};

const entornoDeApi = (doble, puerto) => ({
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(puerto),
  SUPABASE_URL: doble.url,
  SUPABASE_PUBLISHABLE_KEY: 'publicable-de-prueba',
  SUPABASE_SECRET_KEY: 'secreta-de-prueba',
  SUPABASE_JWKS_URL: doble.jwksUrl,
  DATABASE_URL: 'marcador',
  DATABASE_POOLER_URL: 'marcador',
  INGESTA_FIRMA_SECRETO: 'secreto-de-ingesta-para-el-camino-e2e-32',
  BIOMETRIA_LLAVE: 'llave-de-biometria-para-el-camino-e2e-32+',
  BIOMETRIA_LLAVE_REF: 'env:BIOMETRIA_LLAVE',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3100',
});

const principal = async () => {
  paso('0 · doble de Supabase Auth con la semántica real del proveedor');
  const doble = await arrancarDobleGotrue();
  ok(`escuchando en ${doble.url}`);

  const puertoApi = await puertoLibre();
  const puertoWeb = await puertoLibre();

  paso('1 · API real, con el JWKS del doble');
  if (!existsSync(resolve(raiz, 'apps/api/dist/main.js'))) {
    console.log('   · compilando la API (no hay dist)');
    await new Promise((listo, falla) => {
      const b = spawn('pnpm', ['--filter', '@ncr/api...', 'build'], { cwd: raiz, stdio: 'ignore' });
      b.on('exit', (c) => (c === 0 ? listo() : falla(new Error('build de la API'))));
    });
  }
  lanzar('node', ['dist/main.js'], {
    cwd: resolve(raiz, 'apps/api'),
    env: entornoDeApi(doble, puertoApi),
    detached: true,
    nombre: 'api',
  });
  if (!(await esperar(`http://127.0.0.1:${puertoApi}/health`, 'la API'))) return;
  ok(`API en http://127.0.0.1:${puertoApi}`);

  paso('2 · consola real (next dev, con el modo estricto de React activo)');
  // El binario de Next se resuelve desde el paquete real: con pnpm no hay
  // `node_modules/next` en la raíz, y `node_modules/.bin/next` es un envoltorio
  // de shell que `node` no puede ejecutar — el mismo tropiezo que la sonda 11.
  const binDeNext = resolve(
    dirname(createRequire(resolve(raiz, 'apps/web/package.json')).resolve('next/package.json')),
    'dist/bin/next',
  );
  lanzar('node', [binDeNext, 'dev', '-p', String(puertoWeb)], {
    cwd: resolve(raiz, 'apps/web'),
    env: {
      ...process.env,
      NODE_ENV: 'development',
      API_URL: `http://127.0.0.1:${puertoApi}`,
      SUPABASE_URL: doble.url,
      SUPABASE_PUBLISHABLE_KEY: 'publicable-de-prueba',
    },
    detached: true,
    nombre: 'web',
  });
  const base = `http://127.0.0.1:${puertoWeb}`;
  if (!(await esperar(`${base}/acceso`, 'la consola'))) return;
  ok(`consola en ${base}`);

  paso('3 · el camino, conducido en Chromium');
  /**
   * El Chromium del entorno se usa TAL CUAL, con su ruta explícita: la versión
   * que Playwright espera por número de compilación puede no ser la instalada,
   * y descargar navegadores en cada corrida no es una prueba, es una descarga.
   * `NCR_CHROMIUM` permite apuntarlo en otra máquina.
   */
  const ejecutable =
    process.env.NCR_CHROMIUM ??
    ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome'].find(
      (ruta) => existsSync(ruta),
    );
  const navegador = await chromium.launch(
    ejecutable === undefined ? {} : { executablePath: ejecutable },
  );
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });

  await pagina.goto(`${base}/acceso`, { waitUntil: 'networkidle' });
  await pagina.fill('input[name="correo"]', USUARIO.correo);
  await pagina.fill('input[name="contrasena"]', USUARIO.contrasena);
  await pagina.click('button[type="submit"]');

  // ── Inscripción ──────────────────────────────────────────────────────────
  await pagina.waitForSelector('text=Configura tu segundo factor', { timeout: 30_000 });
  ok('la contraseña lleva a la inscripción del factor');

  const imagen = pagina.locator('img[alt*="QR"]');
  await imagen.waitFor({ timeout: 20_000 });
  const pintado = await imagen.evaluate((el) => ({
    ancho: el.naturalWidth,
    alto: el.naturalHeight,
    completa: el.complete,
    esquema: (el.currentSrc || el.src).slice(0, 24),
  }));
  // ESTA es la comprobación que faltaba. No «la respuesta trae un QR», sino
  // que el navegador lo decodificó: un `src` con marcado en crudo deja
  // `naturalWidth` en 0 y enseña el texto alternativo.
  afirmar(
    pintado.completa && pintado.ancho > 0 && pintado.alto > 0,
    `el navegador PINTA el QR (${pintado.ancho}×${pintado.alto}, ${pintado.esquema}…)`,
  );

  await pagina.click('text=¿No puedes escanear?');
  const secreto = (await pagina.locator('p.font-mono').first().innerText()).replace(/\s+/g, '');
  afirmar(secreto.length >= 16, 'la clave en texto está disponible para quien no puede escanear');

  await pagina.fill('input[name="codigo"]', authenticator.generate(secreto));
  await pagina.click('button[type="submit"]');

  // ── Códigos de recuperación ──────────────────────────────────────────────
  await pagina.waitForSelector('text=Guarda tus códigos de recuperación', { timeout: 30_000 });
  const codigos = await pagina.locator('ul li').allInnerTexts();
  afirmar(
    codigos.length === 10,
    `la API entrega los 10 códigos de recuperación (${codigos.length})`,
  );
  afirmar(
    codigos.every((c) => /^[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(c.trim())),
    'los códigos tienen la forma esperada',
  );

  await pagina.check('input[type="checkbox"]');
  await pagina.click('text=Entrar a la consola');

  // ── Tablero ──────────────────────────────────────────────────────────────
  await pagina.waitForURL(/\/tablero/, { timeout: 30_000 });
  await pagina.waitForSelector('h1', { timeout: 30_000 });
  afirmar(pagina.url().includes('/tablero'), 'la sesión `aal2` entra al tablero');
  const encabezado = await pagina.locator('h1').first().innerText();
  afirmar(encabezado.trim().length > 0, `el tablero renderiza («${encabezado.trim()}»)`);

  // ── La vuelta: volver a entrar NO debe pedir inscribir otra vez ──────────
  paso('4 · segunda entrada: con el factor ya verificado');
  await contexto.clearCookies();
  await pagina.goto(`${base}/acceso`, { waitUntil: 'networkidle' });
  await pagina.fill('input[name="correo"]', USUARIO.correo);
  await pagina.fill('input[name="contrasena"]', USUARIO.contrasena);
  await pagina.click('button[type="submit"]');
  await pagina.waitForSelector('text=Verificación en dos pasos', { timeout: 30_000 });
  // Es el defecto que dejó al cliente fuera: la consola le mandaba a inscribir
  // otra vez y el proveedor respondía 403 `insufficient_aal`.
  ok('lleva a VERIFICAR, no a inscribir de nuevo');

  await pagina.fill('input[name="codigo"]', authenticator.generate(secreto));
  await pagina.click('button[type="submit"]');
  await pagina.waitForURL(/\/tablero/, { timeout: 30_000 });
  ok('y entra al tablero con el factor que ya tenía');

  afirmar(
    doble.factores().filter((f) => f.status === 'verified').length === 1,
    'queda UN solo factor verificado: la inscripción no dejó residuo',
  );
  afirmar(errores.length === 0, `sin errores de consola en el navegador (${errores.length})`);
  if (errores.length > 0) errores.slice(0, 5).forEach((e) => console.log(`     · ${e}`));

  await navegador.close();
  await doble.cerrar();
};

principal()
  .catch((e) => {
    mal(`el camino se rompió: ${e instanceof Error ? e.message : String(e)}`);
    volcarProcesos();
  })
  .finally(() => {
    cerrarTodo();
    console.log('');
    if (fallos > 0) {
      console.log(`CAMINO DE ACCESO: ${fallos} comprobación(es) fallaron`);
      process.exit(1);
    }
    console.log('CAMINO DE ACCESO: contraseña → factor → QR pintado → aal2 → tablero, completo');
    process.exit(0);
  });
