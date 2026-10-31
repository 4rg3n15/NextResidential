/**
 * 15-Y3 · EL ROSTRO DEL RESIDENTE EN LA WEB, RECORRIDO
 *
 * El titular, en Chromium a 360 px con una CÁMARA FALSA determinista
 * (`--use-fake-device-for-media-stream` leyendo un `.y4m` con un tablero de
 * ajedrez: nítido y bien expuesto), abre la cámara en «Mi rostro», toma la
 * foto, confirma el encuadre (en este Chromium no hay detector de rostros),
 * acepta la política, registra, comprueba que nada de la imagen quedó en los
 * almacenes del navegador, y lo retira. Puro Playwright; el veredicto lo pone
 * el recorrido que lo llama.
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { entrarAlInicio } from './acciones.mjs';

/** Un vídeo Y4M (320×240, 10 fotogramas) con un tablero de ajedrez de 4 px: nitidez 1, iluminación ~0,5. */
export const ficheroDeCamaraFalsa = (sufijo) => {
  const [ancho, alto, cuadro] = [320, 240, 4];
  const y = Buffer.alloc(ancho * alto);
  for (let f = 0; f < alto; f += 1) {
    for (let c = 0; c < ancho; c += 1) {
      y[f * ancho + c] = (Math.floor(f / cuadro) + Math.floor(c / cuadro)) % 2 === 0 ? 16 : 235;
    }
  }
  const croma = Buffer.alloc((ancho / 2) * (alto / 2), 128);
  const fotograma = Buffer.concat([Buffer.from('FRAME\n'), y, croma, croma]);
  const ruta = join(tmpdir(), `ncr-camara-falsa-${sufijo}.y4m`);
  writeFileSync(
    ruta,
    Buffer.concat([
      Buffer.from(`YUV4MPEG2 W${String(ancho)} H${String(alto)} F30:1 Ip A1:1 C420jpeg\n`),
      ...Array.from({ length: 10 }, () => fotograma),
    ]),
  );
  return ruta;
};

export const argumentosDeCamaraFalsa = (fichero) => [
  '--use-fake-device-for-media-stream',
  '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-video-capture=${fichero}`,
];

/** `true` si ni un `data:image` ni un JPEG en base64 quedó en localStorage o sessionStorage. */
const sinImagenEnLosAlmacenes = async (pagina) =>
  pagina.evaluate(() => {
    const todo =
      JSON.stringify(Object.entries(localStorage)) + JSON.stringify(Object.entries(sessionStorage));
    return !todo.includes('data:image') && !todo.includes('/9j/');
  });

/** El titular registra su rostro con la cámara falsa y lo retira. */
export const rostroDelTitular = async ({ pagina, base, titular, ok, afirmar }) => {
  await entrarAlInicio(pagina, base, titular.usuario, titular.contrasena);
  await pagina.goto(`${base}/mi/rostro`);
  // D-152 · `exact`: sin él, «Mi rostro» casa también con el h2 «Registrar mi rostro»
  // (Playwright compara por subcadena y sin mayúsculas), y si ese h2 ya está
  // pintado el localizador falla en modo estricto: «resolved to 2 elements».
  await pagina
    .getByRole('heading', { name: 'Mi rostro', exact: true })
    .waitFor({ timeout: 60_000 });
  await pagina
    .getByText('No ha registrado su rostro. Es opcional: puede entrar sin él.')
    .waitFor({ timeout: 60_000 });
  ok('«Mi rostro» enseña el estado sin rostro y la política vigente');

  await pagina.getByRole('button', { name: 'Abrir la cámara' }).click();
  await pagina.getByRole('button', { name: 'Tomar foto' }).waitFor({ timeout: 20_000 });
  // Un par de fotogramas de la cámara falsa antes de capturar.
  await pagina.waitForTimeout(1500);
  await pagina.getByRole('button', { name: 'Tomar foto' }).click();
  const encuadre = pagina.getByLabel('Encuadre correcto: sale UNA persona, de frente, cerca');
  const sirve = pagina.getByText('La foto sirve.');
  await encuadre.or(sirve).first().waitFor({ timeout: 20_000 });
  if (await encuadre.isVisible()) await encuadre.check();
  await sirve.waitFor({ timeout: 10_000 });
  ok(
    'la cámara frontal se abre, la foto se mide en el navegador y sirve (encuadre confirmado sin detector)',
  );

  const registrar = pagina.getByRole('button', { name: 'Registrar mi rostro' });
  afirmar(
    await registrar.isDisabled(),
    'sin aceptar la política, «Registrar mi rostro» no responde',
  );
  await pagina.getByLabel('Leí y acepto la política del tratamiento de mi rostro').check();
  await registrar.click();
  await pagina.getByText('Listo: su rostro quedó registrado.').waitFor({ timeout: 30_000 });
  await pagina
    .getByText(/^Registrado|^Activo/)
    .first()
    .waitFor({ timeout: 30_000 });
  ok('con la política aceptada el rostro se registra y el estado cambia');
  afirmar(
    await sinImagenEnLosAlmacenes(pagina),
    'la imagen no queda en localStorage ni sessionStorage',
  );

  await pagina.getByRole('button', { name: 'Retirar mi rostro' }).click();
  await pagina
    .getByRole('dialog', { name: '¿Retirar su rostro?' })
    .getByRole('button', { name: 'Retirar' })
    .click();
  await pagina.getByText('Su rostro se retiró.').waitFor({ timeout: 30_000 });
  ok('«Retirar mi rostro» confirma y lo retira en el acto');
};
