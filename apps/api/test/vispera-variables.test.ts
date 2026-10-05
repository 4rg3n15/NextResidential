import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { leerEntornos, lineasDeVariables } from '../../../scripts/lib/vispera-variables.mjs';
import {
  API_COMPLETA,
  CONSOLA_DE_SITIO,
  SECRETO,
  borrarRepositorios,
  repositorio,
  sinValoresNiIps,
} from './dobles/entornos-de-la-vispera';

/**
 * 15-S1 · A2 · las variables nuevas desde la 15-N en los .env de la API y de la
 * consola: las que faltan, por clase, y las combinaciones con las que la API o
 * la consola no arrancan. Siempre por su NOMBRE: ningún valor en la salida.
 */
afterEach(borrarRepositorios);

describe('15-S1 · A2 · variables nuevas desde la 15-N en los .env de la API y de la consola', () => {
  it('todas declaradas y en su sitio: ningún ✗, y ningún valor en la salida', () => {
    const r = repositorio(API_COMPLETA, { '.env': CONSOLA_DE_SITIO });
    const lineas = lineasDeVariables(leerEntornos(r.raiz, r.rutaEnv));
    expect(lineas).toContain('    ✓ las 16 nuevas están declaradas');
    expect(lineas).toContain('    ✓ las 4 nuevas están declaradas');
    expect(lineas.filter((l) => l.includes('✗'))).toEqual([]);
    sinValoresNiIps(lineas);
  });

  it('las que faltan, por clase: obligatorias, vacías en sitio y de Netlify', () => {
    const api = API_COMPLETA.split('\n')
      .filter((l) => !/^(PGBOSS_POOL_MAX|WEB_PUSH_TTL_SEGUNDOS|API_IP_FIRMA_SECRETO)=/.test(l))
      .concat('SUPABASE_POOLER_MAX_CLIENTES=')
      .join('\n');
    const r = repositorio(api, { '.env': '# ninguna de las cuatro nuevas\n' });
    const lineas = lineasDeVariables(leerEntornos(r.raiz, r.rutaEnv));
    expect(lineas).toContainEqual(
      expect.stringMatching(
        /✗ obligatorias, sin valor: PGBOSS_POOL_MAX, SUPABASE_POOLER_MAX_CLIENTES → cópielas/,
      ),
    );
    expect(lineas).toContainEqual(
      expect.stringMatching(
        /· pueden ir vacías en sitio y no están: WEB_PUSH_TTL_SEGUNDOS → basta la línea vacía/,
      ),
    );
    expect(lineas).toContainEqual(
      expect.stringMatching(
        /· de Netlify, no están: API_IP_FIRMA_SECRETO → en sitio, la línea vacía/,
      ),
    );
    expect(lineas).toContainEqual(
      expect.stringMatching(
        /· de Netlify, no están: API_ORIGEN_PUBLICO, CONSOLA_CABECERA_IP_DE_CONFIANZA, CONSOLA_IP_FIRMA_SECRETO/,
      ),
    );
    expect(lineas).toContainEqual(
      expect.stringMatching(
        /· pueden ir vacías en sitio y no están: RECUPERACION_POR_CORREO → basta la línea vacía/,
      ),
    );
    sinValoresNiIps(lineas);
  });

  it('lo que no arranca o estropea la prueba de mañana, sin decir el valor', () => {
    const api = API_COMPLETA.replace(
      'GUARDIA_AUDIO_TRANSPORTE=websocket',
      'GUARDIA_AUDIO_TRANSPORTE=http',
    )
      .replace(`WEB_PUSH_VAPID_PRIVADA=${SECRETO}`, 'WEB_PUSH_VAPID_PRIVADA=')
      .replace(`WEBRTC_TURN_SECRETO=${SECRETO}`, 'WEBRTC_TURN_SECRETO=');
    const consola = [
      'API_ORIGEN_PUBLICO=https://api.ejemplo.invalid',
      'CONSOLA_CABECERA_IP_DE_CONFIANZA=x-nf-client-connection-ip',
      `CONSOLA_IP_FIRMA_SECRETO=${SECRETO}`,
      'RECUPERACION_POR_CORREO=desactivado',
    ].join('\n');
    const r = repositorio(api, { '.env': consola });
    const lineas = lineasDeVariables(leerEntornos(r.raiz, r.rutaEnv));
    const fallos = lineas.filter((l) => l.includes('✗')).join('\n');
    expect(fallos).toMatch(/Web Push: .* las tres o ninguna → la API NO arranca/);
    expect(fallos).toMatch(/TURN: .* van juntas → la API NO arranca/);
    expect(fallos).toMatch(/GUARDIA_AUDIO_TRANSPORTE no es websocket/);
    expect(fallos).toMatch(
      /RECUPERACION_POR_CORREO con un valor no admitido: la consola NO arranca → «desactivada», vacía o sin la línea/,
    );
    expect(fallos).toMatch(/API_ORIGEN_PUBLICO con valor: en sitio va vacía/);
    expect(fallos).toMatch(/CONSOLA_CABECERA_IP_DE_CONFIANZA con valor/);
    expect(fallos).toMatch(/CONSOLA_IP_FIRMA_SECRETO con valor/);
    expect(fallos).not.toMatch(/\bhttp\b|x-nf-client-connection-ip|desactivado/);
    sinValoresNiIps(lineas);
  });

  it('RECUPERACION_POR_CORREO vacía no es un ✗: la consola arranca con ella (DT-15S1-02)', () => {
    const r = repositorio(API_COMPLETA, {
      '.env': CONSOLA_DE_SITIO.replace(
        'RECUPERACION_POR_CORREO=desactivada',
        'RECUPERACION_POR_CORREO=',
      ),
    });
    const lineas = lineasDeVariables(leerEntornos(r.raiz, r.rutaEnv));
    expect(lineas).toContain('    ✓ las 4 nuevas están declaradas');
    expect(lineas.filter((l) => l.includes('✗'))).toEqual([]);
  });

  it('la consola lee .env y .env.local, y manda el último: como Next en producción', () => {
    // En `.env`, un valor que impide arrancar; en `.env.local`, el bueno.
    const r = repositorio(API_COMPLETA, {
      '.env': `${CONSOLA_DE_SITIO.replace('RECUPERACION_POR_CORREO=desactivada', 'RECUPERACION_POR_CORREO=desactivado')}\n`,
      '.env.local': 'RECUPERACION_POR_CORREO=desactivada\n',
    });
    const entornos = leerEntornos(r.raiz, r.rutaEnv);
    expect(entornos.rotulos.consola).toBe('apps/web/.env + apps/web/.env.local');
    expect(lineasDeVariables(entornos).filter((l) => l.includes('✗'))).toEqual([]);
    expect(
      lineasDeVariables(leerEntornos(r.raiz, join(r.raiz, 'no-existe.env'))).join('\n'),
    ).toMatch(/✗ no existe: copie apps\/api\/\.env\.example/);
  });

  it('sin ningún .env de la consola, lo dice', () => {
    const r = repositorio(API_COMPLETA, {});
    expect(lineasDeVariables(leerEntornos(r.raiz, r.rutaEnv)).join('\n')).toMatch(
      /apps\/web\/\.env\n {4}✗ no existe: copie apps\/web\/\.env\.example/,
    );
  });
});
