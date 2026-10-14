/**
 * 15-Y1 · LAS ACCIONES DEL RECORRIDO DEL RESIDENTE EN LA WEB
 *
 * Lo que `recorrido-residente-web.mjs` repite o hace por HTTP: el
 * superadministrador con `aal2` contra el doble, las llamadas a la API, entrar
 * por el acceso, llenar «Crear cuenta», completar el primer ingreso y leer los
 * almacenes del navegador. Puro Playwright y `fetch`; el veredicto (ok/mal) lo
 * pone el recorrido.
 */
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';

/** La cuenta SEMBRADA del superadministrador (supabase/seed). Clave de un solo uso. */
export const SUPERADMIN = {
  id: '00000000-0000-4000-8000-0000000000a2',
  correo: 'superadmin@nextcontrol.invalid',
  contrasena: `Ncr-${randomBytes(12).toString('base64url')}`,
  rol: 'superadministrador',
  copropiedadId: null,
};

/** El superadministrador con `aal2`, por HTTP contra el doble: contraseña, factor, verificación. */
export const tokenAal2 = async (doble) => {
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

export const api = (puerto) => async (metodo, ruta, token, cuerpo) => {
  const r = await fetch(`http://127.0.0.1:${String(puerto)}${ruta}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: r.status, cuerpo: await r.json().catch(() => ({})) };
};

export const entrar = async (pagina, base, usuario, contrasena) => {
  await pagina.goto(`${base}/acceso`);
  await pagina.getByLabel('Usuario').fill(usuario);
  await pagina.getByLabel('Código de la copropiedad').fill('MIRA');
  await pagina.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await pagina.locator('form button[type="submit"]').click();
};

/** Los seis campos de «Crear cuenta» y la casilla; NO pulsa el botón. */
export const llenarCrearCuenta = async (pagina, { usuario, correo, contrasena, codigo, fecha }) => {
  await pagina.getByText('Tratamiento de sus datos').waitFor({ timeout: 20_000 });
  await pagina.getByLabel('Usuario').fill(usuario);
  await pagina.getByLabel('Correo de contacto', { exact: true }).fill(correo);
  await pagina.getByLabel('Contraseña', { exact: true }).fill(contrasena);
  await pagina.getByLabel('Confirme la contraseña').fill(contrasena);
  await pagina.getByLabel('Código de invitación').fill(codigo);
  await pagina.getByLabel('Fecha de nacimiento').fill(fecha);
  await pagina.getByLabel(/He leído y acepto/).check();
};

/** Espera el primer ingreso (por ENCABEZADO: el menú repite «Mi vivienda» en un enlace oculto a 360 px), lo completa y espera el inicio. Devuelve si se invitó a registrar el rostro. */
export const primerIngreso = async (pagina, { nombres, apellidos }) => {
  await pagina.getByRole('heading', { name: 'Primer ingreso' }).waitFor({ timeout: 60_000 });
  await pagina.getByLabel('Nombres').fill(nombres);
  await pagina.getByLabel('Apellidos').fill(apellidos);
  await pagina
    .getByLabel('Número de documento')
    .fill(
      `9${String(Date.now()).slice(-8)}${randomBytes(2).toString('hex')}`
        .replace(/\D/g, '')
        .slice(0, 12),
    );
  await pagina.getByLabel('Teléfono').fill('3001234567');
  await pagina.getByLabel('Fecha de nacimiento').fill('1990-05-17');
  await pagina.getByRole('button', { name: 'Guardar y continuar' }).click();
  // 15-Y3 · tras el alta, la invitación del rostro (una vez): «Ahora no» deja pasar al inicio.
  const inicio = pagina.getByRole('heading', { name: 'Mi vivienda' });
  const invitacion = pagina.getByRole('heading', { name: 'Entre con su rostro' });
  await inicio.or(invitacion).first().waitFor({ timeout: 60_000 });
  const invitado = await invitacion.isVisible();
  if (invitado) await pagina.getByRole('button', { name: 'Ahora no' }).click();
  await inicio.waitFor({ timeout: 60_000 });
  return invitado;
};

/** `true` si ninguno de los secretos quedó en `localStorage` ni `sessionStorage`. */
export const almacenesSinSecretos = async (pagina, secretos) => {
  const guardado = await pagina.evaluate(
    () =>
      JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage)),
  );
  return secretos.every((s) => !guardado.includes(s));
};

/** La administración crea al titular en la primera vivienda sin titular (D-W9). Devuelve la respuesta y la vivienda. */
export const crearTitular = async (llamar, admin, copropiedadId, { usuario, inicial, nombre }) => {
  const libres = await llamar(
    'GET',
    `/copropiedades/${copropiedadId}/residentes/viviendas-sin-titular`,
    admin,
  );
  const vivienda = libres.cuerpo[0];
  if (vivienda === undefined)
    throw new Error(`sin viviendas sin titular (${String(libres.estado)})`);
  const alta = await llamar('POST', `/copropiedades/${copropiedadId}/residentes/cuentas`, admin, {
    usuario,
    contrasenaInicial: inicial,
    nombre,
    viviendaId: vivienda.id,
  });
  return { alta, vivienda };
};

/** El titular entra por la API, declara dos ocupantes y devuelve el código de una plaza libre. */
export const codigoDePlazaLibre = async (llamar, copropiedadId, { usuario, contrasena }) => {
  const sesion = await llamar('POST', '/auth/acceso', '', { codigo: 'MIRA', usuario, contrasena });
  const token = sesion.cuerpo.accessToken ?? '';
  const plazas = await llamar('POST', `/copropiedades/${copropiedadId}/mi/ocupantes`, token, {
    numero: 2,
  });
  const codigo = (plazas.cuerpo.plazas ?? []).find((p) => p.libre)?.codigo ?? '';
  return { sesion, plazas, codigo };
};

/** Un bloque que falla no tumba el recorrido: se dice cuál, dónde estaba la página y qué decía. */
export const bloqueCon = (mal) => async (etiqueta, fn, pagina) => {
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

/** Un menor contra la API, directamente: el servidor lo niega (D-W2) sin crear nada. */
export const registroDeMenor = (llamar, codigoDeInvitacion, usuario) =>
  llamar('POST', '/auth/registro', '', {
    usuario,
    correo: `${usuario}@ejemplo.invalid`,
    contrasena: `Menor#${usuario.slice(-4)}Zz`,
    confirmacion: `Menor#${usuario.slice(-4)}Zz`,
    codigoDeInvitacion,
    fechaNacimiento: '2012-01-01',
    aceptaTratamientoDeDatos: true,
    versionPolitica: '2026-10-provisional-1',
  });

/** El veredicto del recorrido: ✓ y ✗ por consola, y el recuento de fallos al final. */
export const reportero = () => {
  let fallos = 0;
  const ok = (m) => console.log(`   ✓ ${m}`);
  const mal = (m) => {
    console.log(`   ✗ ${m}`);
    fallos += 1;
  };
  return {
    ok,
    mal,
    paso: (m) => console.log(`\n▸ ${m}`),
    afirmar: (c, m) => (c ? ok(m) : mal(m)),
    fallos: () => fallos,
  };
};

export const secretosFuera = async (afirmar, pagina, secretos) =>
  afirmar(
    await almacenesSinSecretos(pagina, secretos),
    'ni la contraseña ni el código de plaza quedan en localStorage o sessionStorage',
  );

/** 15-Y3 · entra y llega al inicio: si la invitación del rostro aparece (otro navegador), «Ahora no». */
export const entrarAlInicio = async (pagina, base, usuario, contrasena) => {
  await entrar(pagina, base, usuario, contrasena);
  const inicio = pagina.getByRole('heading', { name: 'Mi vivienda' });
  const invitacion = pagina.getByRole('heading', { name: 'Entre con su rostro' });
  await inicio.or(invitacion).first().waitFor({ timeout: 60_000 });
  if (await invitacion.isVisible()) await pagina.getByRole('button', { name: 'Ahora no' }).click();
  await inicio.waitFor({ timeout: 60_000 });
};
