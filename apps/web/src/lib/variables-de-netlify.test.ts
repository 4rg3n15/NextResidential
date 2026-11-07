import { describe, expect, it } from 'vitest';
import {
  CABECERA_DE_NETLIFY,
  juzgarCabeceras,
  juzgarEmpaquetado,
  juzgarVariables,
  leerCabeceras,
} from '../../../../scripts/lib/variables-de-netlify.mjs';
import { construirCsp } from '../middleware-csp';

/**
 * D-160 · lo que comprueba el flujo `desplegar-consola.yml`, juzgado aquí con
 * la CSP REAL de la consola (`construirCsp`), no con una cadena copiada: si la
 * consola cambiara su política, esta prueba lo vería antes que el despliegue.
 */
const COMPLETAS = {
  API_URL: 'https://api.ejemplo.invalid',
  SUPABASE_URL: 'https://ref.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_de-prueba',
  API_ORIGEN_PUBLICO: 'https://api.ejemplo.invalid',
  CONSOLA_CABECERA_IP_DE_CONFIANZA: CABECERA_DE_NETLIFY,
  CONSOLA_IP_FIRMA_SECRETO: 'secreto-compartido-de-prueba-de-32-o-mas',
};

const cspDeProduccion = (origenApi?: string) =>
  construirCsp({
    nonce: 'bm9uY2UtZGUtcHJ1ZWJhLTEyMzQ=',
    desarrollo: false,
    origenApi,
    origenApiWebSocket: origenApi?.replace('https://', 'wss://'),
    origenEvidencia: 'https://ref.supabase.co',
    peticionSegura: true,
  });

const respuesta = (csp: string, codigo = 200) =>
  leerCabeceras(
    [
      'HTTP/2 301',
      'location: /acceso',
      '',
      `HTTP/2 ${String(codigo)}`,
      `content-security-policy: ${csp}`,
      'strict-transport-security: max-age=63072000; includeSubDomains; preload',
      '',
      '',
    ].join('\r\n'),
  );

describe('D-160 · las variables del sitio en Netlify', () => {
  it('completas y sin nada prohibido: ningún motivo', () => {
    expect(juzgarVariables(COMPLETAS)).toEqual([]);
  });

  it('las que faltan o están vacías, por su nombre', () => {
    const sinApi: Record<string, string> = { ...COMPLETAS, CONSOLA_IP_FIRMA_SECRETO: ' ' };
    delete sinApi.API_URL;
    expect(juzgarVariables(sinApi)).toEqual(['falta API_URL', 'falta CONSOLA_IP_FIRMA_SECRETO']);
  });

  it('una firma ENMASCARADA (secreta en Netlify) cuenta como declarada', () => {
    expect(juzgarVariables({ ...COMPLETAS, CONSOLA_IP_FIRMA_SECRETO: '************' })).toEqual([]);
  });

  it('otra cabecera de IP, NEXT_PUBLIC_ y la llave secreta: todo rechazado sin mostrar valores', () => {
    const motivos = juzgarVariables({
      ...COMPLETAS,
      CONSOLA_CABECERA_IP_DE_CONFIANZA: 'x-forwarded-for',
      NEXT_PUBLIC_API: 'x',
      SUPABASE_SECRET_KEY: `sb_secret_${'v'.repeat(24)}`,
    });
    expect(motivos).toEqual([
      `CONSOLA_CABECERA_IP_DE_CONFIANZA no es ${CABECERA_DE_NETLIFY}`,
      'NEXT_PUBLIC_API: NEXT_PUBLIC_ es público por definición',
      'SUPABASE_SECRET_KEY nunca va en la consola',
      'SUPABASE_SECRET_KEY contiene una llave SECRETA de Supabase',
    ]);
    expect(motivos.join(' ')).not.toContain('v'.repeat(24));
  });
});

describe('D-160 · la respuesta de la consola publicada', () => {
  it('la CSP real con la API pública pasa, tras una redirección', () => {
    expect(juzgarCabeceras(respuesta(cspDeProduccion('https://api.ejemplo.invalid')))).toEqual([]);
  });

  it('la CSP real SIN la API pública: el flujo directo y el audio no abrirían, y se dice', () => {
    expect(juzgarCabeceras(respuesta(cspDeProduccion()))).toEqual([
      'connect-src sin la API pública (https): falta API_ORIGEN_PUBLICO en Netlify',
      'connect-src sin la API pública por wss: el audio de la guardia no abriría',
    ]);
  });

  it('sin CSP, con unsafe-inline o con otro código', () => {
    expect(juzgarCabeceras({ codigo: 200, cabeceras: {} })).toEqual([
      'sin Content-Security-Policy',
    ]);
    expect(
      juzgarCabeceras(respuesta("script-src 'self' 'unsafe-inline'; frame-ancestors 'none'", 502)),
    ).toEqual(
      expect.arrayContaining([
        'la consola respondió 502, no 200',
        'script-src sin nonce',
        "script-src con 'unsafe-inline'",
      ]),
    );
  });
});

describe('D-160 · lo que deja `netlify build`', () => {
  const BUENO = {
    funciones: [{ name: '___netlify-server-handler', runtimeVersion: 'nodejs22.x' }],
    rutasDeBorde: [
      {
        function: '___netlify-edge-handler-node-middleware',
        pattern: '^(?:/((?!_next/static|_next/image|favicon.ico).*))$',
      },
    ],
    nodeMayor: '22',
  };

  it('la función de Next en el Node mayor de .nvmrc y el middleware con su emparejador', () => {
    expect(juzgarEmpaquetado(BUENO)).toEqual([]);
  });

  it('otro Node, sin función de Next, sin middleware o con el emparejador perdido', () => {
    expect(
      juzgarEmpaquetado({
        ...BUENO,
        funciones: [{ name: '___netlify-server-handler', runtimeVersion: 'nodejs24.x' }],
      }),
    ).toEqual(['la función corre en nodejs24.x, y .nvmrc es Node 22']);
    expect(juzgarEmpaquetado({ ...BUENO, funciones: [] })).toEqual([
      'no hay función que sirva Next (___netlify-server-handler)',
    ]);
    expect(juzgarEmpaquetado({ ...BUENO, rutasDeBorde: [] })).toEqual([
      'el middleware (CSP con nonce) no está como función de borde',
    ]);
    expect(
      juzgarEmpaquetado({
        ...BUENO,
        rutasDeBorde: [{ function: '___netlify-edge-handler-node-middleware', pattern: '^/.*$' }],
      }),
    ).toEqual(['el middleware perdió su emparejador: correría también sobre los estáticos']);
  });
});
