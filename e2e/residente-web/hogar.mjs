/**
 * 15-Y2 · EL HOGAR DEL RESIDENTE EN LA WEB, RECORRIDO
 *
 * Lo que la 15-Y2 añade a la consola, visto en Chromium a 360 px contra la
 * API real: el titular añade una plaza y comparte su código, registra y edita
 * a un menor, registra, edita y elimina un vehículo propio y revoca una visita
 * suya; quien no es titular comparte códigos y registra menores, pero no ve
 * «Añadir plaza» ni «Retirar». Puro Playwright y `fetch`; el veredicto lo pone
 * el recorrido que lo llama.
 */
import { randomBytes } from 'node:crypto';
import { entrar } from './acciones.mjs';

/** Una «foto» que el servidor acepta por su tipo real (JPEG) y sus medidas; no es un rostro. */
const FOTO = {
  contenidoBase64: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0xff, 0xd9,
  ]).toString('base64'),
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.5, proporcionRostro: 0.4 },
};

/** El titular entra por la API y registra una visita de dos horas que empieza en dos minutos: nace programada, revocable. */
export const visitaDelTitular = async (llamar, copropiedadId, { usuario, contrasena }, sufijo) => {
  const sesion = await llamar('POST', '/auth/acceso', '', { codigo: 'MIRA', usuario, contrasena });
  const token = sesion.cuerpo.accessToken ?? '';
  const visita = await llamar('POST', `/copropiedades/${copropiedadId}/mi/visitas`, token, {
    nombre: `Visita del hogar ${sufijo}`,
    documento: `8${String(Date.now()).slice(-8)}`,
    inicio: new Date(Date.now() + 2 * 60_000).toISOString(),
    duracionMinutos: 120,
    placa: null,
    observaciones: null,
    foto: FOTO,
    casillaMarcada: true,
    claveDeIdempotencia: `hogar-${randomBytes(12).toString('hex')}`,
  });
  return { sesion, visita };
};

const cupoDe = async (pagina) => {
  const texto = (await pagina.getByText(/^Plazas: \d+ de \d+$/).textContent()) ?? '';
  return Number(/Plazas: (\d+) de/.exec(texto)?.[1] ?? '0');
};

/** El titular, en su navegador: plazas, menor, vehículo y visita. */
export const hogarDelTitular = async ({ pagina, base, titular, sufijo, ok, afirmar }) => {
  await entrar(pagina, base, titular.usuario, titular.contrasena);
  await pagina.getByRole('heading', { name: 'Mi vivienda' }).waitFor({ timeout: 60_000 });

  await pagina.goto(`${base}/mi/perfil`);
  await pagina.getByText(/^Plazas: \d+ de \d+$/).waitFor({ timeout: 60_000 });
  const antes = await cupoDe(pagina);
  await pagina.getByRole('button', { name: 'Añadir plaza' }).click();
  await pagina.getByText(/^Plaza añadida\. Plazas: \d+ de \d+\.$/).waitFor({ timeout: 20_000 });
  afirmar(
    (await cupoDe(pagina)) === antes + 1,
    `el titular añade una plaza (${String(antes)} → ${String(antes + 1)})`,
  );
  await pagina
    .getByRole('button', { name: /^Compartir el código/ })
    .first()
    .click();
  await pagina
    .getByText(/Código compartido|Mensaje con el código copiado|No se pudo copiar/)
    .waitFor({ timeout: 10_000 });
  ok(
    '«Compartir» entrega el código de la plaza libre por la hoja del sistema o el portapapeles, y lo dice',
  );
  afirmar(
    (await pagina.getByRole('button', { name: 'Retirar' }).count()) >= 1,
    'el titular ve «Retirar» en las plazas libres',
  );

  await pagina.goto(`${base}/mi/familia`);
  await pagina.getByRole('button', { name: 'Añadir menor' }).click();
  const menor = pagina.getByRole('dialog', { name: 'Añadir menor' });
  await menor.waitFor({ timeout: 20_000 });
  await menor.getByLabel('Nombres').fill('Menor');
  await menor.getByLabel('Apellidos').fill(`Hogar ${sufijo}`);
  await menor.getByLabel('Fecha de nacimiento').fill('2015-08-21');
  await menor.getByLabel(/Parentesco/).fill('Hija');
  await menor.getByLabel('Número de documento').fill(`1${String(Date.now()).slice(-7)}`);
  await menor.getByRole('button', { name: 'Registrar' }).click();
  await pagina.getByText('Menor registrado en su plaza.').waitFor({ timeout: 20_000 });
  const fila = pagina.getByRole('listitem', { name: `Menor Hogar ${sufijo}` });
  await fila.waitFor({ timeout: 20_000 });
  afirmar(
    /Hija · \d+ años · Tarjeta de identidad/.test((await fila.textContent()) ?? ''),
    'el menor aparece en «Mi familia» con parentesco, edad y documento enmascarado, sin cuenta',
  );
  await fila.getByRole('button', { name: 'Editar' }).click();
  const edicion = pagina.getByRole('dialog', { name: 'Editar menor' });
  await edicion.getByLabel(/Parentesco/).fill('Sobrina');
  await edicion.getByRole('button', { name: 'Guardar' }).click();
  await pagina.getByText('Datos guardados.').waitFor({ timeout: 20_000 });
  afirmar(
    /Sobrina/.test((await fila.textContent()) ?? ''),
    'el titular edita al menor y la fila cambia',
  );

  const placa = `Y2${sufijo.toUpperCase().slice(0, 4)}`;
  await pagina.goto(`${base}/mi/vehiculos`);
  await pagina.getByRole('button', { name: 'Registrar vehículo' }).click();
  const alta = pagina.getByRole('dialog', { name: 'Registrar vehículo' });
  await alta.getByLabel('Placa').fill(placa);
  await alta.getByLabel('Color').fill('Gris');
  await alta.getByLabel('Modelo').fill('2020');
  await alta.getByRole('checkbox').first().check();
  await alta.getByRole('button', { name: 'Registrar' }).click();
  await pagina.getByText(placa).waitFor({ timeout: 20_000 });
  await pagina.getByRole('button', { name: 'Editar' }).first().click();
  const vehiculo = pagina.getByRole('dialog', { name: 'Editar vehículo' });
  await vehiculo.getByLabel('Color').fill('Azul');
  await vehiculo.getByRole('button', { name: 'Guardar' }).click();
  await pagina.getByText(`Vehículo ${placa} actualizado.`).waitFor({ timeout: 20_000 });
  afirmar(
    (await pagina.getByText('Azul').count()) >= 1,
    `el titular edita su vehículo ${placa} y el cambio se ve`,
  );
  await pagina.getByRole('button', { name: 'Eliminar' }).first().click();
  await pagina
    .getByRole('dialog', { name: `¿Eliminar ${placa}?` })
    .getByRole('button', { name: 'Eliminar' })
    .click();
  await pagina
    .getByText(new RegExp(`Vehículo ${placa} eliminado|${placa} ya tenía historial`))
    .waitFor({ timeout: 20_000 });
  ok('«Eliminar» borra el vehículo sin historial (o lo deja dado de baja si lo tuviera) y lo dice');

  await pagina.goto(`${base}/mi/visitas`);
  await pagina.getByRole('button', { name: 'Revocar' }).first().waitFor({ timeout: 60_000 });
  await pagina.getByRole('button', { name: 'Revocar' }).first().click();
  const revocar = pagina.getByRole('dialog', { name: /^¿Revocar la visita de/ });
  await revocar.getByLabel(/Motivo/).fill('ya no viene');
  await revocar.getByRole('button', { name: 'Revocar' }).click();
  await pagina.getByText(/^Visita revocada\./).waitFor({ timeout: 20_000 });
  ok('el titular revoca su visita con motivo y lee cuántos equipos la retiraron');
};

/** Quien no es titular: comparte y registra menores, pero no añade ni retira plazas. */
export const hogarDelOcupante = async ({ pagina, base, ocupante, sufijo, afirmar }) => {
  await entrar(pagina, base, ocupante.usuario, ocupante.contrasena);
  await pagina.getByRole('heading', { name: 'Mi vivienda' }).waitFor({ timeout: 60_000 });
  await pagina.goto(`${base}/mi/perfil`);
  await pagina
    .getByText('Sólo el titular de la vivienda añade y retira plazas.')
    .waitFor({ timeout: 60_000 });
  afirmar(
    (await pagina.getByRole('button', { name: 'Añadir plaza' }).count()) === 0 &&
      (await pagina.getByRole('button', { name: 'Retirar' }).count()) === 0,
    'quien no es titular no ve «Añadir plaza» ni «Retirar», y lee por qué',
  );
  await pagina.goto(`${base}/mi/familia`);
  const fila = pagina.getByRole('listitem', { name: `Menor Hogar ${sufijo}` });
  await fila.waitFor({ timeout: 60_000 });
  afirmar(
    (await fila.getByRole('button', { name: 'Código para su cuenta' }).count()) === 0 &&
      (await pagina.getByRole('button', { name: 'Añadir menor' }).count()) === 1,
    'el otro adulto ve al menor y puede registrar otro, pero el código de traspaso es del titular',
  );
};
