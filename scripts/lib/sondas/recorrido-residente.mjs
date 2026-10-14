/**
 * 15-Y1 · EL RECORRIDO DEL RESIDENTE EN LA WEB, VISTO FALLAR
 *
 * Como el de la consola (37 bis): la prueba fuerte es el propio recorrido
 * contra la API, la base y el navegador (paso 13d). Aquí, sin base y sin
 * Chromium, se comprueba lo que puede comprobarse siempre: que la falta de lo
 * que necesita es un fallo explícito que lo dice, nunca un salto en silencio
 * que parezca verde.
 */
import { join } from 'node:path';

export const sondasDeRecorridoDelResidente = ({ banco, correr, ok, mal }) => {
  const sinBase = correr('node', ['e2e/recorrido-residente-web.mjs'], {
    timeout: 60_000,
    env: { ...process.env, DATABASE_URL_PRUEBAS: '' },
  });
  sinBase.codigo !== 0 && /sin DATABASE_URL_PRUEBAS/.test(sinBase.salida)
    ? ok('sin base el recorrido del residente falla y dice que NO se ha verificado')
    : mal(`sin base el recorrido del residente no falla como debe (codigo ${sinBase.codigo})`);
  const sinNavegador = correr('node', ['e2e/recorrido-residente-web.mjs'], {
    timeout: 60_000,
    env: { ...process.env, NCR_CHROMIUM: join(banco, 'chromium-que-no-existe') },
  });
  sinNavegador.codigo !== 0 && /no hay Chromium/.test(sinNavegador.salida)
    ? ok('sin Chromium el recorrido del residente falla y lo dice')
    : mal(
        `sin Chromium el recorrido del residente no falla como debe (codigo ${sinNavegador.codigo})`,
      );
};
