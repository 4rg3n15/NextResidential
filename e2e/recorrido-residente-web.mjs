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
 *   6 · un menor no crea nada: ni desde la consola ni contra la API;
 *   7 · (15-Y2) el titular añade una plaza y comparte su código, registra y
 *       edita a un menor, registra, edita y elimina un vehículo y revoca una
 *       visita suya;
 *   8 · (15-Y2) quien no es titular no ve «Añadir plaza» ni «Retirar».
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
import { arrancarDobleGotrue } from './doble-gotrue.mjs';
import {
  SUPERADMIN,
  api,
  bloqueCon,
  codigoDePlazaLibre,
  crearTitular,
  entrar,
  llenarCrearCuenta,
  primerIngreso,
  reportero,
  secretosFuera,
  tokenAal2,
} from './residente-web/acciones.mjs';
import { codigoInvalidoYMenor } from './residente-web/cuenta.mjs';
import { hogarDelOcupante, hogarDelTitular, visitaDelTitular } from './residente-web/hogar.mjs';
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
const sufijo = randomBytes(3).toString('hex');
const INICIAL = `Inicial#${sufijo}Aa`;
const DEL_TITULAR = `Titular#${sufijo}Bb`;
const OTRA = `Perfil#${sufijo}Cc`;
const DEL_OCUPANTE = `Ocupante#${sufijo}Dd`;

const { ok, mal, paso, afirmar, fallos } = reportero();
const bloque = bloqueCon(mal);
const sinSecretos = (pagina, secretos) => secretosFuera(afirmar, pagina, secretos);

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
    const { alta, vivienda } = await crearTitular(llamar, admin, MIRA, {
      usuario: usuarioTitular,
      inicial: INICIAL,
      nombre: `Titular ${sufijo}`,
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
        // ADR-037 §5 · la cuenta nace asignada; la PERSONA se completa en el primer ingreso.
        await primerIngreso(pagina, {
          nombres: `Titular ${sufijo}`,
          apellidos: `Prueba ${sufijo}`,
        });
        ok('tras el cambio obligado, el titular completa su primer ingreso y ve «Mi vivienda»');
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
        await sinSecretos(pagina, [INICIAL, DEL_TITULAR, OTRA]);
      },
      pagina,
    );
    await contexto.close();

    paso('4 · el titular declara ocupantes y comparte el código de una plaza');
    const plaza = await codigoDePlazaLibre(llamar, MIRA, {
      usuario: usuarioTitular,
      contrasena: OTRA,
    });
    afirmar(
      plaza.sesion.estado === 200 || plaza.sesion.estado === 201,
      `el titular entra por la API con la contraseña del Perfil (${String(plaza.sesion.estado)})`,
    );
    codigoDePlaza = plaza.codigo;
    afirmar(
      codigoDePlaza !== '',
      `hay un código de plaza libre para compartir (${String(plaza.plazas.estado)})`,
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
        await llenarCrearCuenta(p2, {
          usuario: usuarioOcupante,
          correo: `ocupante.${sufijo}@ejemplo.invalid`,
          contrasena: DEL_OCUPANTE,
          codigo: codigoDePlaza,
          fecha: '1992-03-14',
        });
        await p2.getByRole('button', { name: 'Crear cuenta' }).click();
        await primerIngreso(p2, { nombres: `Ocupante ${sufijo}`, apellidos: `Prueba ${sufijo}` });
        ok('la cuenta se crea con el código de plaza, entra sola y completa su primer ingreso');
        await sinSecretos(p2, [DEL_OCUPANTE, codigoDePlaza]);
      },
      p2,
    );
    await c2.close();

    paso('6 · un código inválido y un menor');
    const c3 = await navegador.newContext({ viewport: { width: 360, height: 740 } });
    const p3 = await c3.newPage();
    await codigoInvalidoYMenor({
      p3,
      base,
      sufijo,
      lectura,
      llamar,
      codigoDePlaza,
      contrasena: DEL_OCUPANTE,
      afirmar,
      bloque,
    });
    await c3.close();

    paso('7 · 15-Y2 · el hogar del titular: plaza, código, menor, vehículo y visita');
    const titular = { usuario: usuarioTitular, contrasena: OTRA };
    const { visita } = await visitaDelTitular(llamar, MIRA, titular, sufijo);
    afirmar(
      visita.estado === 201 && visita.cuerpo.creada === true,
      `el titular registra por la API la visita que va a revocar (${String(visita.estado)})`,
    );
    const c4 = await navegador.newContext({ viewport: { width: 360, height: 740 } });
    const p4 = await c4.newPage();
    await bloque(
      'hogar del titular',
      () => hogarDelTitular({ pagina: p4, base, titular, sufijo, ok, afirmar }),
      p4,
    );
    await c4.close();

    paso('8 · 15-Y2 · el hogar visto por quien no es titular');
    const c5 = await navegador.newContext({ viewport: { width: 360, height: 740 } });
    const p5 = await c5.newPage();
    const ocupante = { usuario: usuarioOcupante, contrasena: DEL_OCUPANTE };
    await bloque(
      'hogar del ocupante',
      () => hogarDelOcupante({ pagina: p5, base, ocupante, sufijo, afirmar }),
      p5,
    );
    await c5.close();
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
  `\nRECORRIDO DEL RESIDENTE EN LA WEB: ${fallos() === 0 ? 'completo' : `${String(fallos())} fallo(s)`}`,
);
process.exitCode = fallos() === 0 ? 0 : 1;
