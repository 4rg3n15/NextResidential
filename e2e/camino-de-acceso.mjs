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
import { existsSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
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

/**
 * Chromium del entorno, en las dos plataformas del proyecto: macOS para
 * desarrollo, Linux para CI. Se prefiere el que ya está instalado —descargar
 * navegadores en cada corrida no es una prueba, es una descarga— y si no hay
 * ninguno se deja que Playwright resuelva por su registro propio, que es lo
 * habitual tras `playwright install`.
 */
const chromiumDelEntorno = () => {
  const raices = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers'].filter(
    (r) => typeof r === 'string' && r.length > 0 && existsSync(r),
  );
  for (const base of raices) {
    for (const carpeta of readdirSync(base).filter((d) => d.startsWith('chromium'))) {
      const candidatos = [
        join(base, carpeta, 'chrome-linux', 'chrome'),
        join(base, carpeta, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
        join(base, carpeta, 'chrome'),
      ];
      const hallado = candidatos.find((ruta) => existsSync(ruta));
      if (hallado !== undefined) return hallado;
    }
  }
  return undefined; // que lo resuelva Playwright con su propio registro
};

/**
 * ¿Hay navegador? Tres respuestas, y las tres importan:
 *   · una ruta   → ese ejecutable, sin descargar nada;
 *   · `undefined`→ no hay uno explícito pero Playwright tiene el suyo instalado;
 *   · `null`     → NO hay ninguno, y eso es un fallo, nunca un salto silencioso.
 */
const navegadorDisponible = () => {
  const explicito = process.env.NCR_CHROMIUM;
  if (explicito !== undefined && explicito !== '') return existsSync(explicito) ? explicito : null;
  const delEntorno = chromiumDelEntorno();
  if (delEntorno !== undefined) return delEntorno;
  try {
    return existsSync(chromium.executablePath()) ? undefined : null;
  } catch {
    return null;
  }
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
  mal(`${etiqueta} no llegó a responder en ${intentos}s`);
  // Sin esto el fallo era mudo —«no respondió» y ni una línea de por qué—, que
  // es el defecto que este camino existe para cazar, cometido aquí mismo.
  volcarProcesos();
  return false;
};

/** La salida COMPLETA de cada proceso, a disco: ocho líneas no diagnostican. */
const volcarADisco = () => {
  for (const { nombre, salida } of procesos) {
    writeFileSync(`/tmp/ncr-camino-${nombre}.log`, salida.join(''));
  }
  console.log('   · salida completa en /tmp/ncr-camino-{api,web}.log');
};

const volcarProcesos = () => {
  volcarADisco();
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
  /**
   * LO PRIMERO ES EL NAVEGADOR, antes de levantar un solo proceso. Sin esto la
   * falta de Chromium se descubría después de compilar la consola —minuto y
   * medio— y, peor, el guardián que la declaraba vivía en el guion de shell
   * mirando una ruta de Linux: en macOS el paso no se ejecutaba ni se omitía,
   * simplemente no salía. Aquí la ausencia es un fallo inmediato y explícito.
   */
  paso('0 · Chromium con el que recorrer el camino');
  const ejecutable = navegadorDisponible();
  if (ejecutable === null) {
    mal('no hay Chromium instalado: el camino del navegador NO se ha verificado');
    console.log('     instálalo con `pnpm exec playwright install chromium`');
    console.log('     o apunta al que ya tengas con NCR_CHROMIUM=/ruta/al/chrome');
    return;
  }
  ok(ejecutable ?? 'el que resuelve Playwright por su registro');

  paso('0b · doble de Supabase Auth con la semántica real del proveedor');
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

  paso('2 · consola COMPILADA (next build + start), que es lo que se despliega');
  // El binario de Next se resuelve desde el paquete real: con pnpm no hay
  // `node_modules/next` en la raíz, y `node_modules/.bin/next` es un envoltorio
  // de shell que `node` no puede ejecutar — el mismo tropiezo que la sonda 11.
  const binDeNext = resolve(
    dirname(createRequire(resolve(raiz, 'apps/web/package.json')).resolve('next/package.json')),
    'dist/bin/next',
  );
  const entornoWeb = {
    ...process.env,
    NODE_ENV: 'production',
    API_URL: `http://127.0.0.1:${puertoApi}`,
    SUPABASE_URL: doble.url,
    SUPABASE_PUBLISHABLE_KEY: 'publicable-de-prueba',
    // La consola compilada se sirve por http en el propio equipo: con `Secure`
    // el navegador descartaría la cookie y no habría sesión que recorrer.
    COOKIE_SEGURA: 'false',
  };
  /**
   * Se compila y se sirve el resultado, **no `next dev`**. Es más lento y es lo
   * correcto: en desarrollo, el sobreimpreso de Next inyecta estilos en línea
   * que la CSP —con nonce y sin `unsafe-inline`— rechaza, y esas violaciones
   * son ruido de una superficie que nadie despliega. Comprobar la CSP contra
   * `dev` obligaría a tolerar violaciones, que es cómo un control deja de
   * controlar. Aquí, si el navegador se queja, la queja es real.
   */
  console.log('   · compilando la consola');
  await new Promise((listo, falla) => {
    const b = spawn('node', [binDeNext, 'build'], {
      cwd: resolve(raiz, 'apps/web'),
      env: entornoWeb,
      stdio: 'ignore',
    });
    b.on('exit', (c) => (c === 0 ? listo() : falla(new Error('build de la consola'))));
  });
  lanzar('node', [binDeNext, 'start', '-p', String(puertoWeb)], {
    cwd: resolve(raiz, 'apps/web'),
    env: entornoWeb,
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
  let navegador;
  try {
    navegador = await chromium.launch(
      ejecutable === undefined ? {} : { executablePath: ejecutable },
    );
  } catch (e) {
    /**
     * Sin navegador NO hay verde: se dice qué falta y qué comando lo resuelve.
     * El guion que llama a este comprueba el código de salida, así que una
     * ausencia de Chromium sale como fallo y no como silencio — que es
     * justamente lo que ocurría cuando el guardián vivía en el shell y miraba
     * una ruta de Linux estando el desarrollo en macOS.
     */
    mal('no hay Chromium con el que recorrer el camino');
    console.log('     instala uno con `pnpm exec playwright install chromium`');
    console.log('     o apunta al que ya tengas con NCR_CHROMIUM=/ruta/al/chrome');
    console.log(`     detalle: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    return;
  }
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('console', (m) => {
    if (m.type() === 'error') errores.push(m.text());
  });
  /** Respuestas del propio origen que no son 2xx: el rastro que faltaba. */
  const respuestasMalas = [];
  const trazas = [];
  pagina.on('response', (r) => {
    if (!r.url().includes('/api/')) return;
    if (r.status() >= 400) {
      respuestasMalas.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`);
    }
    // Rastro de TODA respuesta del propio origen, con un trozo del cuerpo. Sin
    // esto, un 2xx con el cuerpo equivocado es indistinguible de un 2xx bueno,
    // y depurar el paso de los códigos costó tres corridas por no tenerlo.
    void r
      .text()
      .then((t) => {
        trazas.push(
          `${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} :: ${t.slice(0, 120)}`,
        );
      })
      .catch(() => undefined);
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
  /**
   * Se ESPERA a que la lista llegue. El encabezado se pinta de inmediato y los
   * códigos vienen de una petición, así que leer la lista aquí mismo la
   * encontraba vacía: la comprobación fallaba por su propia prisa, y la
   * siguiente —«tienen la forma esperada»— pasaba en vacío sobre cero
   * elementos. Es la familia de defectos que este proyecto lleva contando, esta
   * vez dentro de la propia prueba. Se espera la lista o el error, y nunca se
   * afirma sobre una lista vacía.
   */
  // Se espera con localizadores, NO con `waitForFunction`: esa evalúa una
  // cadena como JavaScript y la CSP de la consola lo prohíbe —sin
  // `unsafe-eval`, que es justo lo que queremos—. La prueba tiene que caber
  // dentro de la política que el producto impone, no al revés.
  /**
   * Se espera EXACTAMENTE lo que se va a afirmar: el décimo código. Correr una
   * carrera contra `[role="alert"]` hacía que cualquier región de aviso ya
   * presente en la página resolviera la espera de inmediato y la lista se
   * leyera vacía — la prueba culpaba al producto de su propia prisa. Si esto
   * agota el plazo, se dice por qué en vez de seguir con una lista vacía.
   */
  const listaLlego = await pagina
    .locator('ul li')
    .nth(9)
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!listaLlego) {
    const aviso = await pagina
      .locator('[role="alert"]')
      .first()
      .innerText()
      .catch(() => '(sin aviso en pantalla)');
    mal(`los códigos no llegaron a la pantalla: ${aviso}`);
  }
  const codigos = (await pagina.locator('ul li').allInnerTexts()).map((c) => c.trim());
  afirmar(
    codigos.length === 10,
    `la API entrega los 10 códigos de recuperación (${codigos.length})`,
  );
  afirmar(
    codigos.length > 0 && codigos.every((c) => /^[A-F0-9]{5}-[A-F0-9]{5}$/.test(c)),
    'los códigos tienen la forma esperada (y la comprobación no pasa en vacío)',
  );

  await pagina.check('input[type="checkbox"]');
  await pagina.click('text=Entrar a la consola');

  // ── Tablero ──────────────────────────────────────────────────────────────
  await pagina.waitForURL(/\/tablero/, { timeout: 30_000 });
  afirmar(pagina.url().includes('/tablero'), 'la sesión `aal2` entra al tablero');
  // Se espera CONTENIDO, no una etiqueta concreta: comprobar `h1` ataba la
  // prueba a la maquetación en vez de al hecho de que la página cargó.
  await pagina.waitForSelector('main, [role="main"]', { timeout: 30_000 });
  const texto = await pagina.locator('body').innerText();
  afirmar(
    !/volver a intentarlo|no se pudo|sin conexión/i.test(texto),
    'el tablero renderiza sin estado de error',
  );

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
  afirmar(
    respuestasMalas.length === 0,
    `ninguna petición del propio origen falló (${respuestasMalas.join(', ') || 'ninguna'})`,
  );
  afirmar(errores.length === 0, `sin errores de consola en el navegador (${errores.length})`);
  if (errores.length > 0) errores.slice(0, 5).forEach((e) => console.log(`     · ${e}`));
  writeFileSync('/tmp/ncr-camino-red.log', trazas.join('\n'));
  console.log('   · trazas de red en /tmp/ncr-camino-red.log');

  /**
   * ── El interruptor, recorrido también en el navegador ────────────────────
   *
   * `MFA_OBLIGATORIO=false` es una desviación declarada del contrato, y una
   * desviación que solo se prueba con dobles no está probada: lo que el cliente
   * necesita saber es que **entra al tablero con la contraseña**, en un
   * navegador, contra los dos procesos reales. Se levantan otra API y otra
   * consola con la variable puesta, porque se lee al arrancar —que es
   * justamente lo que hay que verificar— y no se puede cambiar en caliente.
   */
  paso('5 · con MFA_OBLIGATORIO=false: la contraseña sola entra al tablero');
  const puertoApiSinMfa = await puertoLibre();
  const puertoWebSinMfa = await puertoLibre();
  lanzar('node', ['dist/main.js'], {
    cwd: resolve(raiz, 'apps/api'),
    env: { ...entornoDeApi(doble, puertoApiSinMfa), MFA_OBLIGATORIO: 'false' },
    detached: true,
    nombre: 'api-sin-mfa',
  });
  if (!(await esperar(`http://127.0.0.1:${puertoApiSinMfa}/health`, 'la API sin MFA'))) return;

  const entornoWebSinMfa = {
    ...entornoWeb,
    API_URL: `http://127.0.0.1:${puertoApiSinMfa}`,
    MFA_OBLIGATORIO: 'false',
  };
  // Se reutiliza la compilación anterior: estas variables se leen en tiempo de
  // ejecución en el servidor, no se hornean en el paquete del navegador.
  lanzar('node', [binDeNext, 'start', '-p', String(puertoWebSinMfa)], {
    cwd: resolve(raiz, 'apps/web'),
    env: entornoWebSinMfa,
    detached: true,
    nombre: 'web-sin-mfa',
  });
  const baseSinMfa = `http://127.0.0.1:${puertoWebSinMfa}`;
  if (!(await esperar(`${baseSinMfa}/acceso`, 'la consola sin MFA'))) return;

  const contextoSinMfa = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const paginaSinMfa = await contextoSinMfa.newPage();
  const erroresSinMfa = [];
  paginaSinMfa.on('console', (m) => {
    if (m.type() === 'error') erroresSinMfa.push(m.text());
  });
  await paginaSinMfa.goto(`${baseSinMfa}/acceso`, { waitUntil: 'networkidle' });
  await paginaSinMfa.fill('input[name="correo"]', USUARIO.correo);
  await paginaSinMfa.fill('input[name="contrasena"]', USUARIO.contrasena);
  await paginaSinMfa.click('button[type="submit"]');
  await paginaSinMfa.waitForURL(/\/tablero/, { timeout: 30_000 });
  ok('la contraseña sola llega al tablero, sin QR y sin código de seis dígitos');

  await paginaSinMfa.waitForSelector('main, [role="main"]', { timeout: 30_000 });
  const textoSinMfa = await paginaSinMfa.locator('body').innerText();
  afirmar(
    !/volver a intentarlo|no se pudo|sin conexión/i.test(textoSinMfa),
    'el tablero renderiza sin estado de error',
  );
  // La desviación tiene que VERSE. Un interruptor de seguridad invisible se
  // queda puesto: nadie lee el entorno de un despliegue que funciona.
  afirmar(
    /Segundo factor desactivado/i.test(textoSinMfa),
    'la consola avisa en pantalla de que el segundo factor está desactivado',
  );
  afirmar(
    erroresSinMfa.length === 0,
    `sin errores de consola en el navegador (${erroresSinMfa.length})`,
  );

  await navegador.close();
  await doble.cerrar();
};

principal()
  .catch((e) => {
    mal(`el camino se rompió: ${e instanceof Error ? e.message : String(e)}`);
    volcarProcesos();
  })
  .finally(() => {
    // La salida completa SIEMPRE queda en disco, pase o falle. Guardarla solo
    // en el camino de excepción fue lo que obligó a repetir corridas enteras
    // para leer una línea.
    volcarADisco();
    cerrarTodo();
    console.log('');
    if (fallos > 0) {
      console.log(`CAMINO DE ACCESO: ${fallos} comprobación(es) fallaron`);
      process.exit(1);
    }
    console.log(
      'CAMINO DE ACCESO: contraseña → factor → QR pintado → aal2 → tablero, completo; ' +
        'y con MFA_OBLIGATORIO=false, la contraseña sola',
    );
    process.exit(0);
  });
