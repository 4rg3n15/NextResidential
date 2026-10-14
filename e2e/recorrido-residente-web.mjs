/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Y1 · EL RESIDENTE SIN APP, POR NAVEGADOR (P-23, DT-15W-07)
 *
 * Lo que un residente con iPhone hace hoy desde Safari, recorrido en Chromium a
 * 360 px contra la API real, PostgreSQL y el doble de GoTrue con administración
 * de usuarios:
 *
 *   1 · la administración crea al titular con su vivienda y contraseña inicial;
 *   2 · el titular entra, cambia la contraseña OBLIGADA, completa su primer
 *       ingreso y, desde el Perfil, vuelve a cambiarla;
 *   3 · el titular declara ocupantes (por la API) y comparte el código de una
 *       plaza;
 *   4 · un adulto crea su cuenta con ese código desde «Crear cuenta», entra
 *       solo, completa su primer ingreso y ve su inicio;
 *   5 · un código inválido recibe la respuesta genérica, tal cual;
 *   6 · un menor no crea nada: ni desde la consola ni contra la API.
 *
 * Nada sensible queda en el navegador: se comprueba que ni la contraseña ni el
 * código de plaza aparecen en `localStorage` ni `sessionStorage`.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { authenticator } from 'otplib';
import { arrancarDobleGotrue } from './doble-gotrue.mjs';
import {
  arrancarApi,
  arrancarConsola,
  cerrarTodo,
  chromiumDelEntorno,
  claimsDesdeLaBase,
  esperar,
  nombrarVolcado,
  prepararBase,
  puertoLibre,
  urlDe,
  volcar,
} from './arnes-de-recorrido.mjs';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { Pool } = createRequire(resolve(raiz, 'apps/api', 'package.json'))('pg');
const MIRA = '10000000-0000-4000-8000-000000000001';
const BASE = 'ncr_recorrido_residente';
const SUPERADMIN = {
  id: '00000000-0000-4000-8000-0000000000a2',
  correo: 'superadmin@nextcontrol.invalid',
  contrasena: `Ncr-${randomBytes(12).toString('base64url')}`,
  rol: 'superadministrador',
  copropiedadId: null,
};
const sufijo = randomBytes(3).toString('hex');
const INICIAL = `Inicial#${sufijo}Aa`;
const DEL_TITULAR = `Titular#${sufijo}Bb`;
const OTRA = `Perfil#${sufijo}Cc`;
const DEL_OCUPANTE = `Ocupante#${sufijo}Dd`;

let fallos = 0;
const ok = (m) => console.log(`   ✓ ${m}`);
const mal = (m) => {
  console.log(`   ✗ ${m}`);
  fallos += 1;
};
const paso = (m) => console.log(`\n▸ ${m}`);
const afirmar = (c, m) => (c ? ok(m) : mal(m));
/** Un bloque que falla no tumba el recorrido: se dice cuál, dónde estaba la página y qué decía. */
const bloque = async (etiqueta, fn, pagina) => {
  try {
    await fn();
  } catch (e) {
    mal(`${etiqueta}: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    if (pagina !== undefined) {
      const texto = await pagina
        .evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 1400))
        .catch(() => '');
      console.log(`     · en ${pagina.url()} · «${texto}»`);
    }
  }
};

/** El superadministrador con `aal2`, por HTTP contra el doble: contraseña, factor, verificación. */
const tokenAal2 = async (doble) => {
  const j = async (ruta, cuerpo, token) =>
    (
      await fetch(`${doble.url}${ruta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(cuerpo),
      })
    ).json();
  const aal1 = (
    await j('/auth/v1/token?grant_type=password', {
      email: SUPERADMIN.correo,
      password: SUPERADMIN.contrasena,
    })
  ).access_token;
  const factor = await j('/auth/v1/factors', { friendly_name: 'recorrido' }, aal1);
  await j(`/auth/v1/factors/${factor.id}/challenge`, {}, aal1);
  const v = await j(
    `/auth/v1/factors/${factor.id}/verify`,
    { code: authenticator.generate(factor.totp.secret) },
    aal1,
  );
  return v.access_token;
};

const api = (puerto) => async (metodo, ruta, token, cuerpo) => {
  const r = await fetch(`http://127.0.0.1:${String(puerto)}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
};

const entrar = async (pagina, base, usuario, contrasena) => {
  await pagina.goto(`${base}/acceso`);
  await pagina.getByLabel('Usuario').fill(usuario);
  await pagina.getByLabel('Código de la copropiedad').fill('MIRA');
  await pagina.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await pagina.locator('form button[type="submit"]').click();
};

const primerIngreso = async (pagina, nombres) => {
  await pagina.getByRole('heading', { name: 'Primer ingreso' }).waitFor({ timeout: 60_000 });
  await pagina.getByLabel('Nombres').fill(nombres);
  await pagina.getByLabel('Apellidos').fill(`Prueba ${sufijo}`);
  await pagina
    .getByLabel('Número de documento')
    .fill(`9${sufijo}${String(Date.now()).slice(-5)}`.replace(/\D/g, '').slice(0, 12));
  await pagina.getByLabel('Teléfono').fill('3001234567');
  await pagina.getByLabel('Fecha de nacimiento').fill('1990-05-17');
  await pagina.getByRole('button', { name: 'Guardar y continuar' }).click();
  await pagina.getByRole('heading', { name: 'Mi vivienda' }).waitFor({ timeout: 60_000 });
};

const sinSecretosEnElNavegador = async (pagina, secretos) => {
  const guardado = await pagina.evaluate(
    () =>
      JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)),
  );
  afirmar(
    secretos.every((s) => !guardado.includes(s)),
    'ni la contraseña ni el código de plaza quedan en localStorage o sessionStorage',
  );
};

const principal = async () => {
  nombrarVolcado('ncr-recorrido-residente');
  paso('0 · Chromium y base de pruebas');
  const ejecutable = chromiumDelEntorno();
  const sinBase = !process.env.DATABASE_URL_PRUEBAS;
  if (ejecutable === null) mal('no hay Chromium: el recorrido del residente NO se ha verificado');
  if (sinBase)
    mal('sin DATABASE_URL_PRUEBAS no hay base: el recorrido del residente NO se ha verificado');
  if (ejecutable === null || sinBase) return;
  prepararBase({
    raiz,
    base: BASE,
    plantilla: 'ncr_recorrido_plantilla',
    dueno: 'sb_postgres_sim',
    rolDeLaApi: 'sb_postgres_api',
  });
  ok(`base ${BASE} recién copiada de la plantilla migrada y sembrada`);

  paso('1 · doble de GoTrue con administración de usuarios, API y consola');
  const lectura = new Pool({ connectionString: urlDe(BASE), max: 2 });
  lectura.on('error', () => undefined);
  const doble = await arrancarDobleGotrue({
    usuarios: [SUPERADMIN],
    claimsDe: claimsDesdeLaBase(lectura),
  });
  const puertoApi = await puertoLibre();
  const puertoWeb = await puertoLibre();
  // La API exige el secreto de ingesta al arrancar (configuración validada, §2.7.1); aquí nadie ingesta.
  arrancarApi({
    raizApi: raiz,
    doble,
    puerto: puertoApi,
    puertoWeb,
    base: BASE,
    rolDeLaApi: 'sb_postgres_api',
    entorno: { INGESTA_FIRMA_SECRETO: `ingesta-del-recorrido-${randomBytes(12).toString('hex')}` },
  });
  if (!(await esperar(`http://127.0.0.1:${String(puertoApi)}/health`, 'la API', mal))) return;
  arrancarConsola({ raizWeb: raiz, doble, puertoApi, puertoWeb });
  const base = `http://127.0.0.1:${String(puertoWeb)}`;
  if (!(await esperar(`${base}/acceso`, 'la consola', mal))) return;
  const llamar = api(puertoApi);
  const navegador = await chromium.launch(
    ejecutable === undefined ? {} : { executablePath: ejecutable },
  );
  const usuarioTitular = `titular.${sufijo}`;
  const usuarioOcupante = `ocupante.${sufijo}`;
  let codigoDePlaza = '';
  try {
    paso('2 · la administración crea al titular con su vivienda y contraseña inicial (D-W9)');
    const admin = await tokenAal2(doble);
    const libres = await llamar(
      'GET',
      `/copropiedades/${MIRA}/residentes/viviendas-sin-titular`,
      admin,
    );
    const vivienda = libres.cuerpo[0];
    if (vivienda === undefined)
      throw new Error(`sin viviendas sin titular (${String(libres.estado)})`);
    const alta = await llamar('POST', `/copropiedades/${MIRA}/residentes/cuentas`, admin, {
      usuario: usuarioTitular,
      contrasenaInicial: INICIAL,
      nombre: `Titular ${sufijo}`,
      viviendaId: vivienda.id,
    });
    afirmar(
      alta.estado === 201,
      `la cuenta del titular nace asignada a la vivienda ${vivienda.identificador} (${String(alta.estado)})`,
    );

    paso('3 · el titular, en el navegador a 360 px: cambio obligado, primer ingreso y Perfil');
    const contexto = await navegador.newContext({ viewport: { width: 360, height: 740 } });
    const pagina = await contexto.newPage();
    await bloque(
      'titular',
      async () => {
        await entrar(pagina, base, usuarioTitular, INICIAL);
        await pagina.getByText('Cambia tu contraseña').waitFor({ timeout: 20_000 });
        ok('el primer ingreso exige cambiar la contraseña inicial (ADR-023)');
        await pagina.getByLabel('Contraseña actual', { exact: true }).fill(INICIAL);
        await pagina.getByLabel('Contraseña nueva', { exact: true }).fill(DEL_TITULAR);
        await pagina.getByLabel('Repite la contraseña nueva', { exact: true }).fill(DEL_TITULAR);
        await pagina.getByRole('button', { name: 'Cambiar y continuar' }).click();
        // ADR-037 §1 y §5 · la cuenta del titular nace asignada a su vivienda, y la
        // PERSONA se completa en el primer ingreso: tras el cambio obligado, la
        // puerta de `/mi` pide ese alta y después ve su vivienda.
        // Por encabezado, no por texto: el menú repite «Mi vivienda» en un enlace oculto a 360 px.
        const llegada = pagina.getByRole('heading', { name: /Primer ingreso|Mi vivienda/ }).first();
        await llegada.waitFor({ timeout: 60_000 });
        if (((await llegada.textContent()) ?? '').includes('Primer ingreso')) {
          await primerIngreso(pagina, `Titular ${sufijo}`);
          ok(
            'tras el cambio obligado, el titular completa su primer ingreso en la consola y ve «Mi vivienda»',
          );
        } else {
          mal(
            'tras el cambio obligado, la consola NO pidió el primer ingreso del titular (ADR-037 §5)',
          );
        }
        afirmar(
          !(await pagina.evaluate(() => document.documentElement.scrollWidth > 360)),
          'a 360 px no hay desplazamiento horizontal',
        );
        await pagina.goto(`${base}/mi/perfil`);
        await pagina.getByRole('button', { name: 'Cambiar contraseña' }).click();
        await pagina.getByLabel('Contraseña actual', { exact: true }).fill(DEL_TITULAR);
        await pagina.getByLabel('Contraseña nueva', { exact: true }).fill(OTRA);
        await pagina.getByLabel('Repita la contraseña nueva', { exact: true }).fill(OTRA);
        await pagina.getByRole('button', { name: 'Cambiar contraseña' }).click();
        await pagina
          .getByText(/Contraseña cambiada|Vuelve a entrar/)
          .first()
          .waitFor({ timeout: 20_000 });
        ok('desde el Perfil cambia la contraseña otra vez');
        await sinSecretosEnElNavegador(pagina, [INICIAL, DEL_TITULAR, OTRA]);
      },
      pagina,
    );
    await contexto.close();

    paso('4 · el titular declara ocupantes y comparte el código de una plaza');
    const sesion = await llamar('POST', '/auth/acceso', '', {
      codigo: 'MIRA',
      usuario: usuarioTitular,
      contrasena: OTRA,
    });
    afirmar(
      sesion.estado === 200 || sesion.estado === 201,
      `el titular entra por la API con la contraseña del Perfil (${String(sesion.estado)})`,
    );
    const token = sesion.cuerpo.accessToken;
    const plazas = await llamar('POST', `/copropiedades/${MIRA}/mi/ocupantes`, token, {
      numero: 2,
    });
    codigoDePlaza = (plazas.cuerpo.plazas ?? []).find((p) => p.libre)?.codigo ?? '';
    afirmar(
      codigoDePlaza !== '',
      `hay un código de plaza libre para compartir (${String(plazas.estado)})`,
    );

    paso(
      '5 · un adulto crea su cuenta desde «Crear cuenta» con ese código, entra solo y completa su primer ingreso',
    );
    const c2 = await navegador.newContext({ viewport: { width: 360, height: 740 } });
    const p2 = await c2.newPage();
    await bloque(
      'crear cuenta',
      async () => {
        await p2.goto(`${base}/acceso`);
        await p2.getByRole('link', { name: /Crear cuenta con el código/ }).click();
        await p2.getByText('Tratamiento de sus datos').waitFor({ timeout: 20_000 });
        await p2.getByLabel('Usuario').fill(usuarioOcupante);
        await p2
          .getByLabel('Correo de contacto', { exact: true })
          .fill(`ocupante.${sufijo}@ejemplo.invalid`);
        await p2.getByLabel('Contraseña', { exact: true }).fill(DEL_OCUPANTE);
        await p2.getByLabel('Confirme la contraseña').fill(DEL_OCUPANTE);
        await p2.getByLabel('Código de invitación').fill(codigoDePlaza);
        await p2.getByLabel('Fecha de nacimiento').fill('1992-03-14');
        await p2.getByLabel(/He leído y acepto/).check();
        await p2.getByRole('button', { name: 'Crear cuenta' }).click();
        await primerIngreso(p2, `Ocupante ${sufijo}`);
        ok('la cuenta se crea con el código de plaza, entra sola y completa su primer ingreso');
        await sinSecretosEnElNavegador(p2, [DEL_OCUPANTE, codigoDePlaza]);
      },
      p2,
    );
    await c2.close();

    paso('6 · un código inválido y un menor');
    const c3 = await navegador.newContext({ viewport: { width: 360, height: 740 } });
    const p3 = await c3.newPage();
    await bloque(
      'código inválido',
      async () => {
        await p3.goto(`${base}/acceso/crear-cuenta`);
        await p3.getByText('Tratamiento de sus datos').waitFor({ timeout: 20_000 });
        await p3.getByLabel('Usuario').fill(`otro.${sufijo}`);
        await p3
          .getByLabel('Correo de contacto', { exact: true })
          .fill(`otro.${sufijo}@ejemplo.invalid`);
        await p3.getByLabel('Contraseña', { exact: true }).fill(DEL_OCUPANTE);
        await p3.getByLabel('Confirme la contraseña').fill(DEL_OCUPANTE);
        await p3.getByLabel('Código de invitación').fill('MIRA-0000-0000');
        await p3.getByLabel('Fecha de nacimiento').fill('1992-03-14');
        await p3.getByLabel(/He leído y acepto/).check();
        await p3.getByRole('button', { name: 'Crear cuenta' }).click();
        // `p[role="alert"]`, no cualquier `role=alert`: Next.js pinta un anunciador de rutas vacío con ese papel.
        const aviso = p3.locator('p[role="alert"]');
        await aviso.waitFor({ timeout: 20_000 });
        const texto = ((await aviso.textContent()) ?? '').trim();
        afirmar(
          texto === 'El código de invitación no es válido o ya se usó',
          `el código inválido recibe la respuesta genérica del servidor, tal cual («${texto}»)`,
        );
        await p3.getByLabel('Fecha de nacimiento').fill('2012-01-01');
        await p3.getByLabel('Fecha de nacimiento').blur();
        await p3
          .getByText(/Las cuentas son para mayores de edad\. Un adulto/)
          .waitFor({ timeout: 5000 });
        // Como en la app: el botón responde, pero la fecha de un menor detiene el envío en la consola.
        await p3.getByRole('button', { name: 'Crear cuenta' }).click();
        await p3.waitForTimeout(1500);
        const { rows: otro } = await lectura.query(
          'SELECT count(*)::int AS n FROM public.usuarios WHERE nombre_usuario = $1',
          [`otro.${sufijo}`],
        );
        afirmar(
          otro[0].n === 0 && (await p3.getByText('Tratamiento de sus datos').isVisible()),
          'con la fecha de un menor la consola no envía nada: cero cuentas',
        );
      },
      p3,
    );
    const menor = await llamar('POST', '/auth/registro', '', {
      usuario: `menor.${sufijo}`,
      correo: `menor.${sufijo}@ejemplo.invalid`,
      contrasena: DEL_OCUPANTE,
      confirmacion: DEL_OCUPANTE,
      codigoDeInvitacion: codigoDePlaza,
      fechaNacimiento: '2012-01-01',
      aceptaTratamientoDeDatos: true,
      versionPolitica: '2026-10-provisional-1',
    });
    const { rows } = await lectura.query(
      'SELECT count(*)::int AS n FROM public.usuarios WHERE nombre_usuario = $1',
      [`menor.${sufijo}`],
    );
    afirmar(
      menor.estado === 400 && rows[0].n === 0,
      `contra la API, un menor recibe 400 y no crea nada (${String(menor.estado)}, ${String(rows[0].n)} filas)`,
    );
    await c3.close();
  } finally {
    await navegador.close();
    await lectura.end();
    await doble.cerrar();
  }
  volcar();
};

try {
  await principal();
} catch (e) {
  mal(`el recorrido se rompió: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await cerrarTodo();
}
console.log(
  `\nRECORRIDO DEL RESIDENTE EN LA WEB: ${fallos === 0 ? 'completo' : `${String(fallos)} fallo(s)`}`,
);
process.exitCode = fallos === 0 ? 0 : 1;
