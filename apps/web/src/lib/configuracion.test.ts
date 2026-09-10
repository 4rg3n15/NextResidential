import { describe, expect, it } from 'vitest';
import { ConfiguracionIncompleta, validarEntorno } from './configuracion';

/**
 * §2.7.1 · **si falta una variable, la aplicación no arranca.**
 *
 * La consola no lo cumplía: comprobaba presencia, de forma perezosa, en la
 * primera petición que necesitara el valor. El síntoma de un entorno
 * incompleto no era «no arranca» sino un `503` en mitad del inicio de sesión,
 * que parece un fallo del proveedor de identidad. Estas pruebas fijan las dos
 * mitades: qué se rechaza y **qué se dice al rechazarlo**.
 */
const COMPLETO = {
  NODE_ENV: 'test',
  API_URL: 'http://api.interno:3000',
  SUPABASE_URL: 'https://proyecto.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
} satisfies NodeJS.ProcessEnv;

const problemasDe = (entorno: NodeJS.ProcessEnv): readonly string[] => {
  try {
    validarEntorno(entorno);
  } catch (e) {
    if (e instanceof ConfiguracionIncompleta) return e.problemas;
    throw e;
  }
  return [];
};

describe('lo que hace fallar el arranque', () => {
  it('un entorno completo se acepta y normaliza la barra final', () => {
    const config = validarEntorno({ ...COMPLETO, SUPABASE_URL: 'https://proyecto.supabase.co/' });
    expect(config.supabaseUrl).toBe('https://proyecto.supabase.co');
    expect(config.apiUrl).toBe('http://api.interno:3000');
  });

  it.each(['API_URL', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'] as const)(
    'sin %s no arranca, y el mensaje la nombra',
    (variable) => {
      const problemas = problemasDe({ ...COMPLETO, [variable]: undefined });
      expect(problemas.join(' ')).toContain(variable);
    },
  );

  it('una variable con solo espacios cuenta como ausente', () => {
    expect(problemasDe({ ...COMPLETO, SUPABASE_PUBLISHABLE_KEY: '   ' }).length).toBeGreaterThan(0);
  });

  it('una URL sin esquema se rechaza: presencia no es validez', () => {
    // Es el caso que la comprobación anterior dejaba pasar y que fallaba
    // después, ya en vuelo, como un 503.
    expect(problemasDe({ ...COMPLETO, SUPABASE_URL: 'proyecto.supabase.co' }).join(' ')).toContain(
      'URL absoluta',
    );
  });

  it('SUPABASE_URL por http fuera de localhost se rechaza', () => {
    expect(
      problemasDe({ ...COMPLETO, SUPABASE_URL: 'http://proyecto.supabase.co' }).join(' '),
    ).toContain('https');
  });

  it('pero la pila local de Supabase por http sí vale', () => {
    expect(
      validarEntorno({ ...COMPLETO, SUPABASE_URL: 'http://127.0.0.1:54321' }).supabaseUrl,
    ).toBe('http://127.0.0.1:54321');
  });

  it('la llave SECRETA en la consola no arranca, y el mensaje explica por qué', () => {
    // Es el riesgo número uno del proyecto: esa llave omite la RLS, y aquí
    // viviría en el proceso que atiende al navegador.
    const problemas = problemasDe({
      ...COMPLETO,
      SUPABASE_PUBLISHABLE_KEY: `sb_secret_${'x'.repeat(20)}`,
    }).join(' ');
    expect(problemas).toContain('SECRETA');
    expect(problemas).toContain('RLS');
  });

  it('en producción la API por http no arranca; fuera de producción sí', () => {
    expect(problemasDe({ ...COMPLETO, NODE_ENV: 'production' }).join(' ')).toContain('https');
    expect(problemasDe({ ...COMPLETO, NODE_ENV: 'development' })).toEqual([]);
  });

  it('el puente de video vacío significa «todavía no», no un error', () => {
    expect(validarEntorno({ ...COMPLETO, PUENTE_VIDEO_URL: '' }).puenteVideoUrl).toBeUndefined();
    expect(validarEntorno(COMPLETO).puenteVideoUrl).toBeUndefined();
  });

  it('la cookie va Secure en producción y no en desarrollo', () => {
    const enProduccion = {
      ...COMPLETO,
      NODE_ENV: 'production' as const,
      API_URL: 'https://api.ejemplo.co',
    };
    expect(validarEntorno(enProduccion).cookieSegura).toBe(true);
    expect(validarEntorno(COMPLETO).cookieSegura).toBe(false);
  });

  it('COOKIE_SEGURA=false vale en local y NO fuera de local', () => {
    // El interruptor existe para poder servir la consola compilada sobre http
    // en el propio equipo. Fuera de ahí sería mandar la sesión en claro.
    const local = {
      ...COMPLETO,
      NODE_ENV: 'production' as const,
      API_URL: 'http://127.0.0.1:3000',
    };
    expect(validarEntorno({ ...local, COOKIE_SEGURA: 'false' }).cookieSegura).toBe(false);
    expect(
      problemasDe({
        ...COMPLETO,
        NODE_ENV: 'production',
        API_URL: 'https://api.ejemplo.co',
        COOKIE_SEGURA: 'false',
      }).join(' '),
    ).toContain('bucle local');
  });

  it('MFA_OBLIGATORIO viene puesto salvo que se apague EXPLÍCITAMENTE', () => {
    // El valor por defecto es lo que protege: un entorno que no menciona la
    // variable conserva la regla del contrato (RN-20). Y se comprueba también
    // la cadena 'false', porque `Boolean('false')` es `true` y ese es el
    // clásico interruptor que queda encendido creyendo que está apagado.
    expect(validarEntorno(COMPLETO).mfaObligatorio).toBe(true);
    expect(validarEntorno({ ...COMPLETO, MFA_OBLIGATORIO: 'true' }).mfaObligatorio).toBe(true);
    expect(validarEntorno({ ...COMPLETO, MFA_OBLIGATORIO: 'false' }).mfaObligatorio).toBe(false);
  });

  it('un valor que no es true ni false NO se interpreta: la consola no arranca', () => {
    // «0», «no», «off» o un espacio de más son las formas habituales de creer
    // que se apagó algo. Cualquiera de ellas debe detener el proceso con un
    // mensaje, nunca resolverse en silencio a un lado u otro.
    for (const valor of ['0', 'no', 'off', 'False ']) {
      expect(problemasDe({ ...COMPLETO, MFA_OBLIGATORIO: valor }).join(' ')).toContain(
        'MFA_OBLIGATORIO',
      );
    }
  });

  it('el mensaje NO incluye el valor recibido', () => {
    // Un fallo de arranque que vuelca el entorno es un fallo de arranque que
    // publica una llave en los registros (§2.7.8).
    const llave = `sb_secret_${'z'.repeat(24)}`;
    const problemas = problemasDe({ ...COMPLETO, SUPABASE_PUBLISHABLE_KEY: llave }).join(' ');
    expect(problemas).not.toContain(llave);
    expect(problemas).not.toContain('z'.repeat(24));
  });
});
