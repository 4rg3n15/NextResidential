/**
 * 15-Y1 · «CREAR CUENTA», LO QUE NO DEBE PASAR
 *
 * El bloque del recorrido del residente que prueba un código inválido y un
 * menor: la consola enseña la respuesta genérica tal cual, la fecha de un menor
 * detiene el envío sin crear nada, y contra la API el menor recibe 400. Sale
 * del guion principal para que ése quepa en 300 líneas.
 */
import { llenarCrearCuenta, registroDeMenor } from './acciones.mjs';

export const codigoInvalidoYMenor = async ({
  p3,
  base,
  sufijo,
  lectura,
  llamar,
  codigoDePlaza,
  contrasena,
  afirmar,
  bloque,
}) => {
  await bloque(
    'código inválido',
    async () => {
      await p3.goto(`${base}/acceso/crear-cuenta`);
      await llenarCrearCuenta(p3, {
        usuario: `otro.${sufijo}`,
        correo: `otro.${sufijo}@ejemplo.invalid`,
        contrasena,
        codigo: 'MIRA-0000-0000',
        fecha: '1992-03-14',
      });
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
  const menor = await registroDeMenor(llamar, codigoDePlaza, `menor.${sufijo}`);
  const { rows } = await lectura.query(
    'SELECT count(*)::int AS n FROM public.usuarios WHERE nombre_usuario = $1',
    [`menor.${sufijo}`],
  );
  afirmar(
    menor.estado === 400 && rows[0].n === 0,
    `contra la API, un menor recibe 400 y no crea nada (${String(menor.estado)}, ${String(rows[0].n)} filas)`,
  );
};
