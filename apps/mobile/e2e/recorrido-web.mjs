#!/usr/bin/env node
/**
 * RECORRIDO DE LA APP EN UN NAVEGADOR DE VERDAD.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ EXISTE, Y QUÉ NO ES
 *
 * «Los defectos que más han costado aparecieron usando el producto, no
 * ejecutando pruebas.» Las pruebas de widget montan un árbol en memoria: no
 * compilan la app para un destino real, no la pintan, no recorren un flujo
 * entero. Tres de los defectos más caros de este proyecto —D-67, D-68, la
 * consola sin estilos— eran invisibles en la suite y evidentes en el navegador.
 *
 * Esto compila la app **para web**, la sirve y la recorre con Playwright:
 * acceso → inicio → familia → vehículos → historial → perfil.
 *
 * **Lo que NO es: una prueba de la API.** Enfrente hay un servidor de guardarropa
 * que contesta las cinco rutas del residente y el `token` de Supabase. La API de
 * verdad tiene sus propias suites —incluidas las dos de aislamiento— y lo que
 * garantiza que las dos partes encajan es el cliente GENERADO desde el contrato
 * más el control `cliente-dart-desfasado.mjs`. Decir que esto prueba la API
 * sería exactamente el tipo de afirmación que este repositorio persigue.
 *
 * **Y el destino web no es el producto.** El producto es iOS y Android. En web
 * no hay Keychain —la sesión vive en memoria y no sobrevive a la recarga— y eso
 * está declarado en `main.dart`. Web es el único destino que este contenedor
 * puede recorrer sin un emulador.
 *
 *   node apps/mobile/e2e/recorrido-web.mjs
 */
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raizApp = join(aqui, '..');
const bundle = join(raizApp, 'build/web');
const capturas = join(raizApp, 'build/recorrido');

const PUERTO = Number(process.env.NCR_PUERTO_RECORRIDO ?? 4599);
const COP = '10000000-0000-4000-8000-000000000001';

if (!existsSync(bundle)) {
  console.error('✗ no hay `build/web`. Compile primero:');
  console.error(
    '  flutter build web --dart-define=API_URL=http://127.0.0.1:4599 ' +
      '--dart-define=SUPABASE_URL=http://127.0.0.1:4599/supabase ' +
      '--dart-define=SUPABASE_PUBLISHABLE_KEY=<la clave publicable, de mentira>',
  );
  process.exit(1);
}

// ─── Datos del guardarropa ───────────────────────────────────────────────────
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenCon = (segundos) =>
  `${b64({ alg: 'RS256' })}.${b64({
    sub: 'auth-1',
    usuario_id: 'usr-1',
    copropiedad_id: COP,
    email: 'maria@ejemplo.invalid',
    exp: Math.floor(Date.now() / 1000) + segundos,
  })}.sin-firma-porque-el-servidor-real-la-verifica`;

const DATOS = {
  vivienda: {
    vivienda: {
      id: 'viv-1',
      identificador: '42',
      agrupacion: 'B',
      etiquetaVivienda: 'Casa',
      etiquetaAgrupacion: 'Manzana',
      direccion: 'Calle inventada 00',
      copropiedadNombre: 'Urbanización de prueba',
      estadoAdministrativo: 'al_dia',
      activa: true,
    },
    vinculo: { residenteId: 'res-1', esTitular: true, nivelAcceso: 'acceso_completo' },
    puedeAutorizar: true,
  },
  familia: [
    {
      residenteId: 'res-1',
      nombre: 'Maria Titular',
      parentesco: 'Propietario',
      esTitular: true,
      nivelAcceso: 'acceso_completo',
      activo: true,
    },
    {
      residenteId: 'res-2',
      nombre: 'Antiguo Residente',
      parentesco: 'Hijo',
      esTitular: false,
      nivelAcceso: 'solo_ingreso',
      activo: false,
    },
  ],
  vehiculos: [
    {
      id: 'veh-1',
      placa: 'ABC123',
      marca: 'Marca',
      modelo: 'Modelo',
      color: 'Blanco',
      esPrincipal: true,
      activo: true,
    },
  ],
  autorizaciones: [
    {
      id: 'aut-1',
      visitante: 'Visitante propio',
      tipo: 'unica',
      desde: new Date(Date.now() - 3600_000).toISOString(),
      hasta: new Date(Date.now() + 3600_000).toISOString(),
      placa: 'DEF456',
      permiteAccesoVehicular: true,
      estado: 'activa',
      acompanantes: 1,
    },
  ],
  historial: [
    {
      id: 'evt-1',
      ocurridoEn: new Date(Date.now() - 7200_000).toISOString(),
      tipo: 'acceso',
      resultado: 'negado',
      motivo: 'FUERA_DE_HORARIO',
      metodo: 'placa',
      placaDetectada: 'DEF456',
      persona: 'Visitante propio',
      zona: 'Piscina',
      decididoPorEdge: true,
    },
  ],
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.ico': 'image/x-icon',
};

/** Peticiones que el guardarropa vio: la prueba mira las cabeceras. */
const vistas = [];

const servidor = createServer(async (peticion, respuesta) => {
  const url = new URL(peticion.url, `http://127.0.0.1:${PUERTO}`);
  vistas.push({ ruta: url.pathname, autorizacion: peticion.headers.authorization });

  const responder = (codigo, cuerpo) => {
    respuesta.writeHead(codigo, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    respuesta.end(JSON.stringify(cuerpo));
  };

  if (peticion.method === 'OPTIONS') return responder(204, {});

  if (url.pathname === '/supabase/auth/v1/token') {
    // 40 s de vida: suficiente para el recorrido y corto para que el margen de
    // refresco entre en juego si alguien deja la pestaña abierta.
    return responder(200, {
      access_token: tokenCon(40),
      refresh_token: 'refresco-de-recorrido',
      expires_in: 40,
    });
  }

  const mi = new RegExp(`^/copropiedades/${COP}/mi/(\\w+)$`).exec(url.pathname);
  if (mi !== null) {
    if (!peticion.headers.authorization?.startsWith('Bearer ')) {
      return responder(401, { mensaje: 'sin token' });
    }
    const clave = mi[1] === 'vivienda' ? 'vivienda' : mi[1];
    const datos = DATOS[clave];
    if (datos === undefined) return responder(404, { mensaje: 'ruta desconocida' });
    return responder(200, datos);
  }

  // Estáticos del bundle.
  const ruta = join(bundle, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
  try {
    const contenido = await readFile(ruta);
    respuesta.writeHead(200, {
      'Content-Type': TIPOS[extname(ruta)] ?? 'application/octet-stream',
    });
    respuesta.end(contenido);
  } catch {
    respuesta.writeHead(404).end('no está');
  }
});

const fallos = [];
const ok = (m) => console.log(`   ✓ ${m}`);
const mal = (m) => {
  console.log(`   ✗ ${m}`);
  fallos.push(m);
};

await new Promise((resolver) => servidor.listen(PUERTO, '127.0.0.1', resolver));
console.log(`▸ guardarropa en http://127.0.0.1:${PUERTO}`);

let navegador;
try {
  const { chromium } = await import('playwright');
  const ejecutable = process.env.NCR_CHROMIUM ?? '/opt/pw-browsers/chromium';
  navegador = await chromium.launch(existsSync(ejecutable) ? { executablePath: ejecutable } : {});
} catch (e) {
  console.error('✗ no hay Chromium con el que recorrer la app:', e.message);
  console.error('  Una omisión no es un verde: instale Playwright o exporte NCR_CHROMIUM.');
  servidor.close();
  process.exit(1);
}

await mkdir(capturas, { recursive: true });
const contexto = await navegador.newContext({ viewport: { width: 420, height: 900 } });
const pagina = await contexto.newPage();
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e)));

const captura = (nombre) => pagina.screenshot({ path: join(capturas, `${nombre}.png`) });

/**
 * Pulsa una pestaña de la barra inferior.
 *
 * Por TEXTO exacto y no por rol: en el árbol de semántica de Flutter una
 * destinación de `NavigationBar` no siempre se anuncia como `button`, y
 * «Vehículos» además casa parcialmente con el acceso rápido «Mis vehículos».
 * El `exact` deja una sola coincidencia — y el hecho de que haga falta es en sí
 * un aviso: dos superficies con nombres tan parecidos también confunden a quien
 * navegue con lector de pantalla.
 */
const irAPestana = async (etiqueta) => {
  /**
   * La barra inferior se busca por varias vías porque el árbol de semántica de
   * Flutter no siempre expone una destinación de `NavigationBar` igual: a veces
   * como `aria-label`, a veces como nodo de texto. Se prueban en orden y se
   * declara cuál funcionó — una sola vía escrita a ciegas es lo que convierte
   * un recorrido en intermitente.
   */
  const vias = [
    pagina.getByLabel(etiqueta, { exact: true }),
    pagina.getByText(etiqueta, { exact: true }),
    pagina.locator(`flt-semantics[aria-label*="${etiqueta}"]`),
  ];
  for (const via of vias) {
    const cuantos = await via.count();
    if (cuantos === 0) continue;
    await via.last().click();
    await pagina.waitForTimeout(500);
    return;
  }
  throw new Error(`no se encontró la pestaña «${etiqueta}» en la barra inferior`);
};
const texto = () => pagina.locator('body').innerText();

/**
 * Espera a que una frase aparezca, con tope. **Sustituye a los
 * `waitForTimeout` fijos**, que es como se escribe un recorrido intermitente:
 * una espera de dos segundos pasa hoy y falla el día que la máquina va cargada,
 * y entonces alguien sube el número en vez de mirar. Aquí, si la frase llega en
 * 300 ms el recorrido sigue en 300 ms; si no llega nunca, falla diciendo qué
 * esperaba.
 */
const esperarTexto = async (frase, ms = 20000) => {
  const limite = Date.now() + ms;
  while (Date.now() < limite) {
    if ((await texto()).includes(frase)) return true;
    await pagina.waitForTimeout(150);
  }
  return false;
};
const hay = (frase) => esperarTexto(frase);

try {
  await pagina.goto(`http://127.0.0.1:${PUERTO}/`, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(2500);

  /**
   * FLUTTER WEB PINTA EN UN `<canvas>`, así que el DOM está VACÍO de texto
   * hasta que se activa el árbol de semántica. No es un detalle del recorrido:
   * es la misma información que consume un lector de pantalla, y activarla es
   * lo que convierte esta comprobación en una de accesibilidad además de una
   * de interfaz. Si un botón no tiene etiqueta semántica, aquí no se encuentra
   * — y tampoco lo encontraría quien navegue con TalkBack o VoiceOver.
   *
   * Flutter expone un botón oculto («Enable accessibility») justo para esto.
   */
  await pagina.evaluate(() => {
    const marcador = document.querySelector('flt-semantics-placeholder');
    if (marcador !== null) marcador.click();
  });
  await pagina.waitForTimeout(1500);

  /**
   * Escribe en un campo y COMPRUEBA QUE EL TEXTO ENTRÓ antes de seguir.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * EL FALLO QUE LO ORIGINA, leído en `fallo.png` y no supuesto
   *
   * La captura del fallo muestra el formulario con **«Contraseña» rellena y
   * «Correo» vacío**, y debajo el propio validador de la app diciendo «Escriba
   * su correo». Es decir: `_entrar()` salía en su primera línea
   * —`if (!formulario.validate()) return;`— y **la petición del token no llegó
   * a existir**. El recorrido esperaba 20 s una petición que, por construcción,
   * ya no iba a ocurrir.
   *
   * La causa es del recorrido, no de la app: en Flutter web el campo visible es
   * un `<canvas>` y el texto entra por un `<input>` que el motor crea AL
   * ENFOCAR. Si se teclea antes de que exista, las pulsaciones se pierden. El
   * segundo campo funciona porque para entonces el motor ya está listo — de ahí
   * la asimetría exacta de la captura.
   *
   * La versión anterior sustituyó `fill()` por clic + tecleo, lo que redujo la
   * ventana sin cerrarla. Esto la cierra: se lee el valor de vuelta y se
   * reintenta. **Y si tras tres intentos sigue vacío, se dice eso** —no se
   * espera una petición que nadie va a hacer—.
   */
  /**
   * Escribir en un campo de Flutter web: ENFOCAR, ESPERAR A QUE EL MOTOR
   * ENGANCHE, y solo entonces teclear.
   *
   * ───────────────────────────────────────────────────────────────────────────
   * LA CAUSA, Y POR QUÉ EL ARREGLO ANTERIOR SOLO LA MOVIÓ DE CAMPO
   *
   * Primero falló «Correo» vacío con «Contraseña» llena. Se añadió un reintento
   * que leía el valor de vuelta del `<input>` y el fallo **cambió de campo**:
   * «Correo» lleno y «Contraseña» vacía. Un arreglo que mueve el síntoma no ha
   * tocado la causa, y aquí la causa es que **se estaba comprobando la cosa
   * equivocada**.
   *
   * En Flutter web el `<input>` del DOM NO es el campo: es un buzón que el
   * motor crea al enfocar y del que copia el texto al widget. Leer
   * `input.value` dice que el navegador recibió las pulsaciones, **no que la
   * app se haya enterado**. Si el motor todavía no ha enganchado su escucha,
   * las dos cosas divergen — y el reintento daba por bueno un campo que para la
   * app seguía vacío. Ese es exactamente el síntoma invertido.
   *
   * De ahí las dos mitades de abajo:
   *
   *   1 · **Atacar la causa, no el síntoma**: no se teclea hasta que el
   *       `<input>` de ese campo existe Y es `document.activeElement`. Ese foco
   *       lo pone el motor, no el clic: es su señal de «ya estoy escuchando».
   *   2 · **Preguntarle a la app, no al DOM**: la única fuente de verdad sobre
   *       lo que el formulario tiene es su propio validador. Si al pulsar
   *       «Entrar» no sale la petición, se mira qué campo reclama la app y se
   *       rellena ESE. El recorrido deja de adivinar.
   */
  const CORREO = 'maria@ejemplo.invalid';
  const CLAVE = 'la-que-sea';

  const escribirEn = async (etiqueta, texto) => {
    const campo = pagina.getByLabel(etiqueta);
    await campo.click();
    try {
      await pagina.waitForFunction(
        (et) => {
          const i = [...document.querySelectorAll('input, textarea')].find(
            (e) => e.getAttribute('aria-label') === et,
          );
          return i !== undefined && i === document.activeElement;
        },
        etiqueta,
        { timeout: 5000 },
      );
    } catch {
      console.log(`   · «${etiqueta}»: el motor no enfocó su <input> en 5 s`);
      return false;
    }
    await pagina.keyboard.type(texto);
    const leido = await campo.inputValue().catch(() => '<ilegible>');
    console.log(
      `   · «${etiqueta}»: enfocado por el motor, tecleado, leído ${JSON.stringify(leido)}`,
    );
    return leido === texto;
  };

  /**
   * Pulsa «Entrar» y EXIGE LA PETICIÓN. Si no sale, no se espera veinte
   * segundos a nada: se le pregunta a la app cuál de sus dos validadores está
   * protestando, se rellena ese campo y se vuelve a pulsar.
   */
  const entrar = async () => {
    for (let vuelta = 1; vuelta <= 3; vuelta += 1) {
      const espera = pagina
        .waitForResponse((r) => r.url().includes('/auth/v1/token'), { timeout: 6000 })
        .catch(() => null);
      await pagina.getByRole('button', { name: 'Entrar' }).click();
      const respuesta = await espera;
      if (respuesta !== null) return respuesta;

      const faltaCorreo = await esperarTexto('Escriba su correo', 500);
      const faltaClave = await esperarTexto('Escriba su contraseña', 500);
      console.log(
        `   · vuelta ${vuelta}: no hubo petición; la app reclama` +
          `${faltaCorreo ? ' el correo' : ''}${faltaClave ? ' la contraseña' : ''}` +
          `${!faltaCorreo && !faltaClave ? ' nada (ningún validador protesta)' : ''}`,
      );
      if (faltaCorreo) await escribirEn('Correo', CORREO);
      if (faltaClave) await escribirEn('Contraseña', CLAVE);
    }
    throw new Error(
      'la app no llegó a pedir el token en 3 vueltas: su propio validador seguía ' +
        'rechazando el formulario. Es el recorrido tecleando en un campo que el motor ' +
        'de Flutter no había enganchado, no un fallo de la app',
    );
  };

  // ── 1 · acceso ────────────────────────────────────────────────────────────
  (await hay('Acceso del residente'))
    ? ok('la app arranca en la pantalla de acceso')
    : mal('no se ve la pantalla de acceso');
  await captura('1-acceso');

  /**
   * El formulario se rellena PULSANDO y TECLEANDO, no con `fill()`.
   *
   * En Flutter web el campo visible es un `<canvas>` y el texto entra por un
   * `<input>` oculto que el motor crea al enfocar. `fill()` escribe en él antes
   * de que exista o mientras el árbol de semántica se reconstruye, y entonces
   * el botón se pulsa con los campos vacíos: la primera versión de este
   * recorrido fallaba una vez de cada tres por esto, y la tentación era subir
   * el `waitForTimeout`. Teclear es lo que hace el residente, y esperar la
   * PETICIÓN —no un reloj— es lo que hace la comprobación determinista.
   */
  await escribirEn('Correo', CORREO);
  await escribirEn('Contraseña', CLAVE);

  const respuestaDelToken = await entrar();
  respuestaDelToken.status() === 200
    ? ok('el acceso pide el token al emisor de identidad')
    : mal(`el emisor contestó ${respuestaDelToken.status()}`);

  // ── 2 · inicio ────────────────────────────────────────────────────────────
  (await hay('Casa 42 · Manzana B'))
    ? ok('entra y compone el título con las etiquetas del conjunto')
    : mal('no se ve la vivienda tras entrar');
  (await hay('Al día')) ? ok('el distintivo administrativo se pinta') : mal('falta el distintivo');
  await captura('2-inicio');

  const conToken = vistas.filter((v) => v.ruta.includes('/mi/') && v.autorizacion);
  conToken.length >= 4
    ? ok(`las ${conToken.length} lecturas salieron con el token en la cabecera`)
    : mal(`solo ${conToken.length} lecturas llevaron token`);

  // ── 3 · familia ───────────────────────────────────────────────────────────
  // `exact` en la barra inferior: «Vehículos» también casa con el acceso
  // rápido «Mis vehículos», y sin precisarlo Playwright para con «strict mode
  // violation». El aviso es útil: dos superficies distintas con el mismo
  // nombre también confunden a quien navega con lector de pantalla.
  await pagina.getByText('Mi familia').first().click();
  (await hay('Antiguo Residente'))
    ? ok('el residente desactivado sigue apareciendo (RN-19)')
    : mal('no se ve el residente desactivado');
  (await hay('Desactivado')) ? ok('y está marcado') : mal('no está marcado');
  await captura('3-familia');

  // Se vuelve por la FLECHA de la pantalla, no por `goBack()` del navegador:
  // es lo que pulsa el residente, y en un teléfono no hay botón «atrás» del
  // navegador. Además así se comprueba que la pila de navegación existe.
  await pagina
    .getByRole('button', { name: /Back|Atrás/i })
    .first()
    .click();
  await esperarTexto('Accesos rápidos');

  // ── 4 · vehículos ─────────────────────────────────────────────────────────
  await irAPestana('Vehículos');
  (await hay('ABC123'))
    ? ok('la placa se muestra como la normalizó el dominio')
    : mal('no se ve la placa');
  await captura('4-vehiculos');

  // ── 5 · las pestañas de 11-B dicen qué falta ──────────────────────────────
  await irAPestana('Visitantes');
  (await hay('en construcción'))
    ? ok('la pestaña de 11-B explica qué falta en vez de quedarse muda')
    : mal('la pestaña pendiente no dice nada');
  await captura('5-pendiente');

  // ── 6 · perfil e historial ────────────────────────────────────────────────
  await irAPestana('Perfil');
  (await hay('maria@ejemplo.invalid'))
    ? ok('el perfil trae el correo de la sesión')
    : mal('sin correo');
  await captura('6-perfil');

  await pagina.getByText('Historial de accesos').first().click();
  (await hay('La zona estaba cerrada a esa hora'))
    ? ok('el motivo de la negación se explica en lenguaje llano')
    : mal('el motivo no se explica');
  (await hay('Decidido en el conjunto, sin nube'))
    ? ok('lo decidido por el Edge se marca (KPI-31)')
    : mal('no se marca lo del Edge');
  await captura('7-historial');

  // ── 7 · ningún error de JavaScript en todo el recorrido ───────────────────
  errores.length === 0
    ? ok('ni un error de JavaScript en el recorrido completo')
    : mal(`${errores.length} error(es) en el navegador: ${errores[0]}`);
} catch (e) {
  mal(`el recorrido se rompió: ${e.message}`);
  await captura('fallo');
} finally {
  await navegador.close();
  servidor.close();
}

console.log(`\ncapturas en ${capturas}`);
if (fallos.length > 0) {
  console.error(`RECORRIDO DE LA APP: ${fallos.length} fallo(s)`);
  process.exit(1);
}
console.log('RECORRIDO DE LA APP: completo');
