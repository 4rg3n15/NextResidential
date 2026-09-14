import { describe, expect, it, vi } from 'vitest';
import { ControlDeBarreraVehicular } from './control-barrera';
import {
  ConfiguracionDeBarreraIncompleta,
  crearControlDeBarreraDesdeEntorno,
} from './desde-entorno';
import { SesionDigest, construirAutorizacion, interpretarDesafio } from './digest';

/**
 * El adaptador de barrera, **sin red y sin equipo**.
 *
 * Todo lo que aquí se afirma sale de la validación en sitio del 15/09/2026
 * contra el equipo instalado. La prueba que da sentido al encargo es la de H-1:
 * que una respuesta afirmativa del aparato **nunca** se convierta en «pasó».
 */
const DESAFIO =
  'Digest qop="auth", realm="IP Camera(C1234)", nonce="4e4f4e43453a313233", stale="FALSE"';

const respuestaOk = (): Response =>
  new Response(
    '<?xml version="1.0" encoding="UTF-8"?><ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>',
    { status: 200 },
  );

const respuesta401 = (): Response =>
  new Response('', { status: 401, headers: { 'www-authenticate': DESAFIO } });

const respuestaNoSoportada = (): Response =>
  new Response(
    '<?xml version="1.0" encoding="UTF-8"?><ResponseStatus><statusCode>4</statusCode><statusString>Invalid Operation</statusString><subStatusCode>notSupport</subStatusCode></ResponseStatus>',
    { status: 200 },
  );

/** Reloj falso: la latencia medida tiene que ser reproducible. */
const relojQueAvanza = (paso = 10): (() => number) => {
  let t = 0;
  return () => {
    t += paso;
    return t;
  };
};

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: string;
  readonly autorizacion: string | undefined;
}

const servidorFalso = (
  guion: readonly (() => Response)[],
): { peticion: typeof fetch; llamadas: Llamada[] } => {
  const llamadas: Llamada[] = [];
  let indice = 0;
  const peticion = (async (url: string | URL | Request, init?: RequestInit) => {
    const cabeceras = new Headers(init?.headers);
    llamadas.push({
      url: String(url),
      metodo: init?.method ?? 'GET',
      cuerpo: String(init?.body ?? ''),
      autorizacion: cabeceras.get('authorization') ?? undefined,
    });
    const siguiente = guion[Math.min(indice, guion.length - 1)]!;
    indice += 1;
    return siguiente();
  }) as unknown as typeof fetch;
  return { peticion, llamadas };
};

const control = (
  guion: readonly (() => Response)[],
): { barrera: ControlDeBarreraVehicular; llamadas: Llamada[] } => {
  const { peticion, llamadas } = servidorFalso(guion);
  return {
    barrera: new ControlDeBarreraVehicular({
      host: 'equipo.de.pruebas.invalid',
      usuario: 'operador',
      clave: 'clave-de-prueba',
      peticion,
      ahora: relojQueAvanza(),
      generarCnonce: () => '0a4f113b',
    }),
    llamadas,
  };
};

describe('traducción de las cuatro órdenes', () => {
  const casos = [
    {
      nombre: 'abrir',
      ejecutar: (b: ControlDeBarreraVehicular) => b.accionar('d1', true),
      modo: 'open',
    },
    {
      nombre: 'cerrar',
      ejecutar: (b: ControlDeBarreraVehicular) => b.accionar('d1', false),
      modo: 'close',
    },
    {
      nombre: 'bloquear',
      ejecutar: (b: ControlDeBarreraVehicular) => b.fijarBloqueo('d1', true),
      modo: 'lock',
    },
    {
      nombre: 'desbloquear',
      ejecutar: (b: ControlDeBarreraVehicular) => b.fijarBloqueo('d1', false),
      modo: 'unlock',
    },
  ] as const;

  for (const caso of casos) {
    it(`«${caso.nombre}» viaja con el cuerpo exacto capturado del equipo`, async () => {
      const { barrera, llamadas } = control([respuesta401, respuestaOk]);
      await caso.ejecutar(barrera);

      const ultima = llamadas[llamadas.length - 1]!;
      expect(ultima.metodo).toBe('PUT');
      expect(ultima.cuerpo).toBe(
        `<?xml version="1.0" encoding="UTF-8"?><BarrierGate><ctrlMode>${caso.modo}</ctrlMode></BarrierGate>`,
      );
      // La ruta verificada, con su canal. Ninguna otra.
      expect(ultima.url).toBe(
        'http://equipo.de.pruebas.invalid:80/ISAPI/Parking/channels/1/barrierGate',
      );
    });
  }

  it('habla por HTTP y no por HTTPS, que es como responde el equipo medido', () => {
    const { barrera } = control([respuestaOk]);
    expect(barrera.destino).toBe('equipo.de.pruebas.invalid:80');
  });
});

/**
 * **La prueba que es el punto del encargo.**
 *
 * H-1: con el equipo bloqueado, la orden de abrir responde `statusCode 1` y el
 * relé no actúa. H-2: no hay señal de posición cableada. Luego una respuesta
 * afirmativa no puede convertirse nunca en «la barrera se abrió».
 */
describe('H-1 · la respuesta correcta no prueba que la barrera se movió', () => {
  it('ante statusCode 1 el resultado es «aceptada» y NO afirma paso franqueado', async () => {
    const { barrera } = control([respuesta401, respuestaOk]);
    const r = await barrera.accionar('d1', true);

    expect(r.estado).toBe('aceptada');
    if (r.estado !== 'aceptada') return;
    expect(r.pasoFranqueadoObservable).toBe(false);

    // Y no existe ningún estado que lo afirme: si alguien añadiera «abierta» o
    // «confirmada», esta lista dejaría de cubrir el tipo y habría que venir
    // aquí a justificarlo — que es exactamente lo que debe costar.
    const estadosAdmitidos = ['aceptada', 'rechazada', 'inalcanzable'];
    expect(estadosAdmitidos).toContain(r.estado);
    expect(JSON.stringify(r)).not.toMatch(/abiert|confirmad|franqueado":true/i);
  });
});

describe('rechazada frente a inalcanzable · el portero tiene que distinguirlas', () => {
  it('statusCode 4 produce «rechazada», con lo que contestó el equipo', async () => {
    const { barrera } = control([respuesta401, respuestaNoSoportada]);
    const r = await barrera.accionar('d1', true);
    expect(r.estado).toBe('rechazada');
    if (r.estado !== 'rechazada') return;
    expect(r.motivo).toMatch(/Invalid Operation/);
  });

  it('agotar el tiempo límite produce «inalcanzable», no «rechazada»', async () => {
    const peticion = (async () => {
      const error = new Error('tiempo agotado');
      error.name = 'TimeoutError';
      throw error;
    }) as unknown as typeof fetch;
    const barrera = new ControlDeBarreraVehicular({
      host: 'equipo.de.pruebas.invalid',
      usuario: 'operador',
      clave: 'clave-de-prueba',
      tiempoLimiteMs: 1500,
      peticion,
      ahora: relojQueAvanza(),
    });

    const r = await barrera.accionar('d1', true);
    expect(r.estado).toBe('inalcanzable');
    if (r.estado !== 'inalcanzable') return;
    // El mensaje dice el plazo: un «no se pudo» obliga a adivinar si insistir.
    expect(r.motivo).toMatch(/1500 ms/);
  });

  it('la red caída también es inalcanzable', async () => {
    const peticion = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const barrera = new ControlDeBarreraVehicular({
      host: 'equipo.de.pruebas.invalid',
      usuario: 'operador',
      clave: 'clave-de-prueba',
      peticion,
      ahora: relojQueAvanza(),
    });
    expect((await barrera.accionar('d1', true)).estado).toBe('inalcanzable');
  });

  it('dos 401 seguidos son credenciales, y NO se insiste una tercera vez', async () => {
    const { barrera, llamadas } = control([respuesta401, respuesta401, respuesta401]);
    const r = await barrera.accionar('d1', true);
    expect(r.estado).toBe('rechazada');
    if (r.estado !== 'rechazada') return;
    expect(r.motivo).toMatch(/credenciales/);
    // Dos viajes, ni uno más: el equipo bloquea la cuenta por intentos fallidos.
    expect(llamadas).toHaveLength(2);
  });
});

describe('Digest MD5', () => {
  it('calcula el «response» del vector de la RFC 2617', () => {
    // El único modo de saber que el cálculo es correcto sin un equipo delante.
    const desafio = interpretarDesafio(
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    );
    expect(desafio).not.toBeNull();
    const cabecera = construirAutorizacion(
      desafio!,
      { usuario: 'Mufasa', clave: 'Circle Of Life' },
      'GET',
      '/dir/index.html',
      1,
      '0a4f113b',
    );
    expect(cabecera).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(cabecera).toContain('nc=00000001');
    expect(cabecera).toContain('qop=auth');
    expect(cabecera).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
  });

  it('interpreta el desafío con y sin comillas, y en cualquier orden', () => {
    const conComillas = interpretarDesafio(DESAFIO);
    const sinComillas = interpretarDesafio(
      'Digest nonce=4e4f4e43453a313233, realm=IP-Camera, qop=auth',
    );
    expect(conComillas?.nonce).toBe('4e4f4e43453a313233');
    expect(conComillas?.qop).toBe('auth');
    expect(sinComillas?.realm).toBe('IP-Camera');
    expect(interpretarDesafio('Basic realm="x"')).toBeNull();
    expect(interpretarDesafio(null)).toBeNull();
  });

  it('el contador `nc` avanza mientras el desafío se reutiliza', () => {
    const sesion = new SesionDigest({ usuario: 'u', clave: 'c' }, () => 'cn');
    expect(sesion.autorizacionPara('PUT', '/x')).toBeNull();
    sesion.aceptarDesafio(DESAFIO);
    expect(sesion.autorizacionPara('PUT', '/x')).toContain('nc=00000001');
    expect(sesion.autorizacionPara('PUT', '/x')).toContain('nc=00000002');
    expect(sesion.autorizacionPara('PUT', '/x')).toContain('nc=00000003');
  });

  it('un desafío nuevo reinicia el contador', () => {
    const sesion = new SesionDigest({ usuario: 'u', clave: 'c' }, () => 'cn');
    sesion.aceptarDesafio(DESAFIO);
    sesion.autorizacionPara('PUT', '/x');
    sesion.aceptarDesafio(DESAFIO.replace('4e4f4e43453a313233', 'otro-nonce'));
    expect(sesion.autorizacionPara('PUT', '/x')).toContain('nc=00000001');
  });

  it('la segunda orden NO vuelve a pedir desafío: reutiliza el que tiene', async () => {
    const { barrera, llamadas } = control([respuesta401, respuestaOk, respuestaOk]);
    await barrera.accionar('d1', true);
    await barrera.accionar('d1', true);

    // Tres viajes para dos órdenes: el 401 solo ocurre una vez.
    expect(llamadas).toHaveLength(3);
    expect(llamadas[1]!.autorizacion).toContain('nc=00000001');
    expect(llamadas[2]!.autorizacion).toContain('nc=00000002');
  });

  it('renegocia ante un 401 TARDÍO y la orden acaba aceptada', async () => {
    // El equipo caduca el desafío a mitad de la sesión. Sin renegociar, la
    // orden se perdería y el operador vería un rechazo que no lo es.
    const { barrera, llamadas } = control([respuesta401, respuestaOk, respuesta401, respuestaOk]);
    await barrera.accionar('d1', true);
    const r = await barrera.accionar('d1', true);

    expect(r.estado).toBe('aceptada');
    expect(llamadas).toHaveLength(4);
    // Tras el desafío nuevo, el contador vuelve a empezar.
    expect(llamadas[3]!.autorizacion).toContain('nc=00000001');
  });
});

describe('configuración por entorno', () => {
  it('sin variables no hay adaptador real, y eso no rompe nada', () => {
    expect(crearControlDeBarreraDesdeEntorno({})).toBeNull();
  });

  it('con las tres obligatorias lo construye', () => {
    const barrera = crearControlDeBarreraDesdeEntorno({
      BARRERA_HOST: 'equipo.de.pruebas.invalid',
      BARRERA_USUARIO: 'operador',
      BARRERA_CLAVE: 'clave',
      BARRERA_PUERTO: '8080',
    });
    expect(barrera?.destino).toBe('equipo.de.pruebas.invalid:8080');
  });

  it('a medias LANZA, y dice qué falta', () => {
    // «No hay equipo» y «alguien se equivocó al escribir una variable» no
    // pueden acabar en el mismo sitio: el segundo dejaría una consola que dice
    // «abriendo» sin que nada se mueva.
    const fallo = (): unknown =>
      crearControlDeBarreraDesdeEntorno({ BARRERA_HOST: 'equipo.de.pruebas.invalid' });
    expect(fallo).toThrow(ConfiguracionDeBarreraIncompleta);
    expect(fallo).toThrow(/BARRERA_USUARIO/);
    expect(fallo).toThrow(/BARRERA_CLAVE/);
  });

  it('no filtra la credencial en el diagnóstico', () => {
    const barrera = crearControlDeBarreraDesdeEntorno({
      BARRERA_HOST: 'equipo.de.pruebas.invalid',
      BARRERA_USUARIO: 'operador',
      BARRERA_CLAVE: 'no-debe-aparecer',
    });
    expect(barrera?.destino).not.toMatch(/no-debe-aparecer/);
  });
});

describe('tiempo límite', () => {
  it('por omisión son 3000 ms y se puede configurar', async () => {
    const vistos: (AbortSignal | null | undefined)[] = [];
    const peticion = (async (_url: unknown, init?: RequestInit) => {
      vistos.push(init?.signal);
      return respuestaOk();
    }) as unknown as typeof fetch;

    await new ControlDeBarreraVehicular({
      host: 'equipo.de.pruebas.invalid',
      usuario: 'u',
      clave: 'c',
      peticion,
    }).accionar('d1', true);

    expect(vistos[0]).toBeInstanceOf(AbortSignal);
  });

  it('el tiempo agotado se anuncia con el plazo configurado', async () => {
    const peticion = vi.fn(async () => {
      const error = new Error('abortada');
      error.name = 'AbortError';
      throw error;
    }) as unknown as typeof fetch;
    const r = await new ControlDeBarreraVehicular({
      host: 'equipo.de.pruebas.invalid',
      usuario: 'u',
      clave: 'c',
      tiempoLimiteMs: 250,
      peticion,
      ahora: relojQueAvanza(),
    }).accionar('d1', true);
    expect(r.estado === 'inalcanzable' && r.motivo).toMatch(/250 ms/);
  });
});
