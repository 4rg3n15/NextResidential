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
import { networkInterfaces } from 'node:os';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { authenticator } from 'otplib';
import { arrancarDobleGotrue, USUARIO } from './doble-gotrue.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Las ONCE pantallas del menú, en el orden de `lib/navegacion.ts`.
 *
 * La ETAPA 10 añade las dos consolas operativas, y entran aquí el mismo día que
 * se construyen: tres defectos seguidos —D-63, D-67 y D-68— se escondieron en
 * la exención del bucle local, y lo que no se recorre por IP no está
 * verificado.
 */
const RUTAS_DE_LA_CONSOLA = [
  '/tablero',
  '/viviendas',
  '/vehiculos',
  '/visitantes',
  '/zonas',
  '/dispositivos',
  '/porteria',
  '/guardia',
  '/eventos',
  '/informes',
  '/configuracion',
];
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
  // ETAPA 15-B · la llave de los secretos de equipo. Distinta de la
  // biométrica también aquí: si este recorrido las igualara, dejaría de
  // reproducir la configuración que el despliegue tiene de verdad.
  EQUIPOS_LLAVE: 'llave-de-equipos-para-el-camino-e2e-32+',
  EQUIPOS_LLAVE_REF: 'env:EQUIPOS_LLAVE',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3100',
  /**
   * ETAPA 14 · este camino levanta la API con adaptadores EN MEMORIA y una
   * `DATABASE_URL` de marcador: no hay cola que planificar. Se apaga
   * explícitamente para que no intente conectar y para que su línea de aviso
   * —«trabajo programado NO se ejecutará»— diga el motivo correcto.
   *
   * Que esté aquí NO es lo que impide el fallo que destapó este paso: la API
   * moría con «getaddrinfo ENOTFOUND base» tras mapear todas sus rutas porque
   * el arranque del planificador bloqueaba `listen()`. Eso se corrigió en el
   * módulo, que ahora no espera y no puede tumbar el arranque. Esta línea solo
   * evita el ruido.
   */
  PLANIFICADOR_HABILITADO: 'false',
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
    /**
     * **`COOKIE_SEGURA` NO se fija aquí, y eso es el arreglo de D-68.**
     *
     * El banco la ponía a `'false'`, es decir **desactivaba justo el atributo
     * que rompe en el despliegue real**. Con eso, el recorrido pasaba en verde
     * mientras la consola servida por una IP de red rechazaba todos los códigos
     * del autenticador. Un banco de pruebas que apaga la condición del defecto
     * no prueba el sistema: prueba una variante suya que nadie despliega.
     *
     * Sin fijarla, `NODE_ENV=production` la resuelve como antes lo hacía el
     * despliegue, y el paso 3.ter recorre el camino por una IP de red — que es
     * donde el navegador deja de tratar el origen como «potencialmente seguro».
     */
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
  /**
   * `-H 0.0.0.0`: el servidor tiene que ser alcanzable **también por la IP de
   * red**, no sólo por el bucle local. Sin eso, el paso 3.bis no puede existir,
   * y ese paso es el que encontró D-67.
   */
  lanzar('node', [binDeNext, 'start', '-H', '0.0.0.0', '-p', String(puertoWeb)], {
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
  /**
   * QUÉ recurso falló, no solo que algo falló.
   *
   * «Failed to load resource: net::ERR_SSL_PROTOCOL_ERROR» es exactamente el
   * tipo de aviso que no se puede diagnosticar: dice el error y calla la URL,
   * así que hay que adivinar cuál de las cincuenta peticiones de la página lo
   * produjo. Con esto, el mensaje trae el recurso y el motivo.
   */
  pagina.on('requestfailed', (p) => {
    const motivo = p.failure()?.errorText ?? 'sin motivo';
    /**
     * `ERR_ABORTED` sobre una precarga RSC **no es un fallo**: es el navegador
     * cancelando una petición en vuelo porque el usuario ya navegó a otro
     * sitio. Contarla como error haría que este control fallara cada vez que
     * alguien pulsa dos enlaces seguidos, y un control que falla por lo normal
     * acaba desactivado — que es peor que no tenerlo.
     *
     * Lo que sí se cuenta es cualquier otro fallo de red, con su URL.
     */
    if (motivo === 'net::ERR_ABORTED' && p.url().includes('_rsc=')) return;
    errores.push(`petición fallida · ${p.url()} · ${motivo}`);
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

  // ── Los ESTILOS, y por un origen que no sea el bucle local ───────────────
  paso('3.bis · la consola se ve, y por cualquier origen (D-67)');
  /**
   * EL INTERVALO QUE ESTE PASO CIERRA.
   *
   * Hasta aquí, el recorrido comprobaba que la página **responde**. El HTML
   * llegaba, las aserciones pasaban, y la pantalla podía estar en texto plano:
   * `upgrade-insecure-requests` reescribía CSS y JavaScript a `https://` contra
   * un servidor que no habla TLS, y todo subrecurso moría con
   * `ERR_CONNECTION_RESET`.
   *
   * **Y no se veía desde `127.0.0.1`**, porque el navegador considera el bucle
   * local un origen «potencialmente seguro» y se salta la subida de esquema.
   * Es decir: el único origen que la prueba visitaba era justo el exento. De
   * ahí que este paso tenga que visitar una IP de red de verdad.
   *
   * Se comprueba lo que se ve, no lo que se sirve: número de reglas CSS
   * aplicadas y el color de fondo real del `body`, que tiene que ser el token
   * `lienzo` del preset. Una hoja que se descarga y no aplica daría 0 reglas.
   */
  const LIENZO_CLARO = 'rgb(248, 249, 250)';

  const ipDeRed = Object.values(networkInterfaces())
    .flat()
    .find((i) => i !== undefined && i.family === 'IPv4' && !i.internal)?.address;

  const medirEstilos = async (destino) => {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx.newPage();
    const subrecursosCaidos = [];
    p2.on('requestfailed', (r) => {
      const motivo = r.failure()?.errorText ?? 'sin motivo';
      if (motivo === 'net::ERR_ABORTED' && r.url().includes('_rsc=')) return;
      subrecursosCaidos.push(`${r.url()} · ${motivo}`);
    });
    await p2
      .goto(`${destino}/acceso`, { waitUntil: 'load', timeout: 30_000 })
      .catch(() => undefined);
    const medido = await p2
      .evaluate(() => ({
        reglas: [...document.styleSheets].reduce((n, h) => {
          try {
            return n + h.cssRules.length;
          } catch {
            return n;
          }
        }, 0),
        fondo: getComputedStyle(document.body).backgroundColor,
      }))
      .catch(() => ({ reglas: 0, fondo: 'no evaluable' }));
    await ctx.close();
    return { ...medido, subrecursosCaidos };
  };

  for (const [etiqueta, destino] of [
    ['bucle local', base],
    ...(ipDeRed === undefined ? [] : [['IP de red', `http://${ipDeRed}:${puertoWeb}`]]),
  ]) {
    const m = await medirEstilos(destino);
    afirmar(
      m.reglas > 0,
      `por ${etiqueta} la hoja de estilos se aplica (${String(m.reglas)} reglas)`,
    );
    afirmar(
      m.fondo === LIENZO_CLARO,
      `por ${etiqueta} el fondo es el token lienzo y no el del navegador (${m.fondo})`,
    );
    afirmar(
      m.subrecursosCaidos.length === 0,
      `por ${etiqueta} ningún subrecurso se cae${m.subrecursosCaidos.length === 0 ? '' : `: ${m.subrecursosCaidos.slice(0, 3).join(' | ')}`}`,
    );
  }

  if (ipDeRed === undefined) {
    /**
     * Sin IP de red no hay verde silencioso: se dice que la mitad que importa
     * no se ejerció. Un paso que se salta sin avisar es exactamente el patrón
     * que dejó vivir a D-67.
     */
    mal('no hay ninguna IPv4 no interna: la mitad de este paso NO se ejerció');
  } else {
    ok(`ejercido también por ${ipDeRed}, que es el origen donde falla si la CSP se ata al proceso`);
  }

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

  // ── EL CAMINO ENTERO, POR UNA IP DE RED ──────────────────────────────────
  paso('3.ter · contraseña → segundo factor → aal2 → tablero, por IP de red (D-68)');
  /**
   * POR QUÉ ESTE PASO EXISTE, Y POR QUÉ NO BASTABA CON 3.bis.
   *
   * 3.bis comprueba que la consola **se ve** por una IP de red. Este comprueba
   * que **funciona**, que es otra cosa: el defecto D-68 dejaba la pantalla
   * perfecta y rechazaba todos los códigos del autenticador con «La sesión
   * expiró», porque la cookie de sesión salía con `Secure` sobre HTTP y el
   * navegador la descartaba en silencio.
   *
   * `127.0.0.1` no lo veía por la misma razón que no veía D-67: el navegador
   * trata el bucle local como origen **potencialmente seguro** y ahí sí acepta
   * cookies `Secure` sobre HTTP. Es decir, el único origen que el recorrido
   * visitaba era el que se salta la comprobación. Cualquier prueba que sólo
   * mire `localhost` está midiendo el caso más favorable.
   */
  if (ipDeRed === undefined) {
    mal('no hay ninguna IPv4 no interna: el camino por red NO se ejerció');
  } else {
    const baseRed = `http://${ipDeRed}:${puertoWeb}`;
    const ctxRed = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const pRed = await ctxRed.newPage();
    const erroresRed = [];
    pRed.on('console', (m) => {
      if (m.type() === 'error') erroresRed.push(m.text());
    });

    await pRed.goto(`${baseRed}/acceso`, { waitUntil: 'networkidle' });
    await pRed.fill('input[name="correo"]', USUARIO.correo);
    await pRed.fill('input[name="contrasena"]', USUARIO.contrasena);
    await pRed.click('button[type="submit"]');
    await pRed.waitForSelector('text=Verificación en dos pasos', { timeout: 30_000 });
    ok('la contraseña lleva al segundo factor');

    /**
     * LA COMPROBACIÓN QUE FALTABA, Y SE MIRA EN EL NAVEGADOR.
     *
     * Si la cookie de sesión no llegó al navegador, el paso siguiente falla
     * pase lo que pase y el mensaje culpará a la sesión. Se comprueba ANTES de
     * teclear el código, para que el diagnóstico salga aquí y no dentro de un
     * «código incorrecto» que no lo es.
     */
    const galletas = await ctxRed.cookies();
    const deSesion = galletas.filter((c) => c.name.startsWith('ncr_'));
    afirmar(
      deSesion.length > 0,
      `el navegador CONSERVA las cookies de sesión por IP (${deSesion.map((c) => c.name).join(', ') || 'ninguna'})`,
    );
    afirmar(
      deSesion.every((c) => c.secure === false),
      'ninguna cookie sale con `Secure` sobre HTTP: el navegador la descartaría en silencio',
    );
    afirmar(
      deSesion.every((c) => c.httpOnly),
      'y todas siguen siendo `httpOnly`: el arreglo no afloja lo que 09-A fijó',
    );

    await pRed.fill('input[name="codigo"]', authenticator.generate(secreto));
    await pRed.click('button[type="submit"]');

    /**
     * O llega al tablero, o se dice **qué contestó la consola**. Un
     * `waitForURL` que expira sólo informa de que no llegó, y el motivo —que es
     * lo único útil— se queda en la pantalla.
     */
    const llego = await pRed
      .waitForURL(/\/tablero/, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (llego) {
      ok('el código del autenticador ENTRA por IP de red, igual que por el bucle local');
    } else {
      const dicho = await pRed.locator('body').innerText();
      const linea = dicho.split('\n').find((l) => /sesión|código|expir|no se pudo/i.test(l));
      mal(`el segundo factor NO entra por IP de red · la consola dice: «${linea ?? 'nada'}»`);
    }

    /**
     * LAS ONCE PANTALLAS: **COMPARADAS**, no juzgadas por separado.
     *
     * Este banco no tiene datos, así que varias pantallas muestran estados
     * vacíos o de error legítimos. Preguntar «¿esta pantalla está bien por
     * IP?» daría rojos que no lo son. La pregunta correcta es **«¿se comporta
     * igual que por el bucle local?»**, porque lo que se persigue es la
     * diferencia por origen, no el estado en sí.
     *
     * Es además la forma que sobrevive a que el banco gane datos mañana.
     */
    const recorrer = async (pagina2, origen) => {
      const visto = {};
      for (const ruta of RUTAS_DE_LA_CONSOLA) {
        await pagina2.goto(`${origen}${ruta}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await pagina2
          .waitForSelector('main, [role="main"]', { timeout: 30_000 })
          .catch(() => undefined);
        const texto = await pagina2.locator('body').innerText();
        // Se resume a las señales que importan, no al texto entero: comparar
        // cuerpos completos daría falsos rojos por una hora en pantalla.
        visto[ruta] = [
          /sin permiso/i.test(texto) ? 'sin-permiso' : '',
          /sin conexión con el servidor/i.test(texto) ? 'sin-conexion' : '',
          /sesión expiró|no devolvió la cookie/i.test(texto) ? 'sin-sesion' : '',
          /no se pudo cargar/i.test(texto) ? 'error' : '',
          pagina2.url().includes(ruta) ? '' : `redirigido-a-${new URL(pagina2.url()).pathname}`,
        ]
          .filter((x) => x !== '')
          .join('+');
      }
      const estado = await pagina2.evaluate(() => ({
        canal: document.body.innerText.includes('En vivo'),
        contextoSeguro: window.isSecureContext,
      }));
      return { visto, ...estado };
    };

    const porIp = await recorrer(pRed, baseRed);
    const porLocal = await recorrer(pagina, base);

    const distintas = RUTAS_DE_LA_CONSOLA.filter((r) => porIp.visto[r] !== porLocal.visto[r]).map(
      (r) => `${r}: local «${porLocal.visto[r] || 'bien'}» ≠ IP «${porIp.visto[r] || 'bien'}»`,
    );
    afirmar(
      distintas.length === 0,
      `las once pantallas se comportan IGUAL por IP que por bucle local${
        distintas.length === 0 ? '' : ` · ${distintas.join(' | ')}`
      }`,
    );
    afirmar(
      porIp.canal === porLocal.canal,
      `el canal en vivo se comporta igual por los dos orígenes (local ${String(porLocal.canal)}, IP ${String(porIp.canal)})`,
    );

    /**
     * LA ÚNICA DIFERENCIA QUE NO ES UN DEFECTO, Y SE DEJA DICHA.
     *
     * Una IP por HTTP **no es un contexto seguro**, así que el navegador no
     * registra el service worker: por ahí la consola no es instalable como PWA
     * y no hay caché sin conexión. No es código nuestro y no se arregla en el
     * código: vuelve sola con dominio y HTTPS. El bucle local sí lo es, y por
     * eso ahí funciona.
     */
    afirmar(
      porLocal.contextoSeguro && !porIp.contextoSeguro,
      `contexto seguro: bucle local ${String(porLocal.contextoSeguro)}, IP por HTTP ${String(porIp.contextoSeguro)} — sin PWA ni caché sin conexión hasta que haya TLS`,
    );

    afirmar(erroresRed.length === 0, `sin errores de consola por IP (${erroresRed.length})`);
    if (erroresRed.length > 0) erroresRed.slice(0, 5).forEach((e) => console.log(`     · ${e}`));
    await ctxRed.close();
  }

  /**
   * ── El interruptor retirado, comprobado en el navegador ──────────────────
   *
   * Aquí se recorría `MFA_OBLIGATORIO=false`, la desviación declarada que
   * dejaba entrar con la contraseña sola. Se retiró entera el 2026-09-10.
   *
   * El paso no se borra: se **invierte**. Se levantan otra API y otra consola
   * con la variable puesta —el valor que antes la apagaba— y se comprueba que
   * no pasa nada: se sigue pidiendo el segundo factor y el tablero sigue sin
   * alcanzarse con la contraseña. Borrarlo habría dejado sin vigilancia
   * precisamente el camino por el que un interruptor así vuelve: alguien
   * reintroduce la variable, nadie lo nota, y el despliegue entra en
   * producción con RN-20 debilitada.
   *
   * Se hace con procesos nuevos porque la configuración se lee al arrancar, que
   * es justo lo que hay que verificar.
   */
  paso('5 · con MFA_OBLIGATORIO=false en el entorno: la regla NO se relaja');
  const puertoApiConVariable = await puertoLibre();
  const puertoWebConVariable = await puertoLibre();
  lanzar('node', ['dist/main.js'], {
    cwd: resolve(raiz, 'apps/api'),
    env: { ...entornoDeApi(doble, puertoApiConVariable), MFA_OBLIGATORIO: 'false' },
    detached: true,
    nombre: 'api-con-variable-retirada',
  });
  if (!(await esperar(`http://127.0.0.1:${puertoApiConVariable}/health`, 'la API'))) return;

  lanzar('node', [binDeNext, 'start', '-p', String(puertoWebConVariable)], {
    cwd: resolve(raiz, 'apps/web'),
    env: {
      ...entornoWeb,
      API_URL: `http://127.0.0.1:${puertoApiConVariable}`,
      MFA_OBLIGATORIO: 'false',
    },
    detached: true,
    nombre: 'web-con-variable-retirada',
  });
  const baseConVariable = `http://127.0.0.1:${puertoWebConVariable}`;
  if (!(await esperar(`${baseConVariable}/acceso`, 'la consola'))) return;

  const contextoConVariable = await navegador.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const paginaConVariable = await contextoConVariable.newPage();
  const erroresConVariable = [];
  paginaConVariable.on('console', (m) => {
    if (m.type() === 'error') erroresConVariable.push(m.text());
  });
  await paginaConVariable.goto(`${baseConVariable}/acceso`, { waitUntil: 'networkidle' });
  await paginaConVariable.fill('input[name="correo"]', USUARIO.correo);
  await paginaConVariable.fill('input[name="contrasena"]', USUARIO.contrasena);
  await paginaConVariable.click('button[type="submit"]');

  // La contraseña correcta lleva al segundo factor, NO al tablero. Se espera a
  // que aparezca el campo del código: si en su lugar llegara al tablero, la
  // espera vencería y el paso fallaría, que es lo que debe ocurrir.
  await paginaConVariable.waitForURL(/\/acceso/, { timeout: 30_000 });
  // El usuario ya tiene factor verificado del paso 3, así que la pantalla que
  // debe salir es la de verificación. Se espera por su título Y por el campo:
  // el título solo diría que se pintó algo, el campo dice que es el correcto.
  await paginaConVariable.waitForSelector('text=Verificación en dos pasos', { timeout: 30_000 });
  await paginaConVariable.waitForSelector('input[name="codigo"]', { timeout: 30_000 });
  ok('la contraseña sola NO entra: se sigue pidiendo el segundo factor');
  afirmar(
    !/\/tablero/.test(paginaConVariable.url()),
    `no se alcanzó el tablero (URL: ${new URL(paginaConVariable.url()).pathname})`,
  );

  // Y el aviso de «segundo factor desactivado» ya no existe en ninguna pantalla:
  // el interruptor no dejó ni el cartel.
  const textoConVariable = await paginaConVariable.locator('body').innerText();
  afirmar(
    !/Segundo factor desactivado|MFA_OBLIGATORIO/i.test(textoConVariable),
    'no queda ni rastro del interruptor en la interfaz',
  );
  afirmar(
    erroresConVariable.length === 0,
    `sin errores de consola en el navegador (${erroresConVariable.length})`,
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
        'y con MFA_OBLIGATORIO=false en el entorno, la regla NO se relaja',
    );
    process.exit(0);
  });
