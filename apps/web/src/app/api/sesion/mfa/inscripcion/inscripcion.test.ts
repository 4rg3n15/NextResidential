import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as RutaInscripcion from './route';

/**
 * Lo que esta suite protege es la propiedad que hace aceptable la pantalla:
 * **nadie inscribe el segundo factor de otra persona.**
 *
 * No se comprueba mirando un `if`. Se comprueba mirando lo que sale por el
 * cable: la petición al proveedor no lleva ningún identificador de usuario, y
 * la única identidad que viaja es el token de la cookie `httpOnly`. Un
 * parámetro «para quién» sería el dato con el que equivocarse, y aquí no
 * existe. Si alguien lo añadiera, estas pruebas se romperían.
 */
const ENTORNO = {
  API_URL: 'http://api.invalid',
  SUPABASE_URL: 'https://proyecto.invalid',
  SUPABASE_PUBLISHABLE_KEY: 'llave-publicable-de-prueba',
  NODE_ENV: 'test',
};

const TOKEN_DEL_TITULAR = 'token-de-quien-llama';

let ruta: typeof RutaInscripcion;
let fetchFalso: ReturnType<typeof vi.fn>;
let galleta: Map<string, string>;
let puestas: { nombre: string; valor: string }[];

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      galleta.has(nombre) ? { name: nombre, value: galleta.get(nombre) } : undefined,
    set: (nombre: string, valor: string) => {
      puestas.push({ nombre, valor });
      galleta.set(nombre, valor);
    },
    delete: (nombre: string) => galleta.delete(nombre),
  }),
}));

/** Sin factores previos y con una inscripción que el proveedor acepta. */
const proveedorNormal = (): ReturnType<typeof vi.fn> =>
  vi.fn(async (url: string, opciones: { method?: string }) => {
    if (url.endsWith('/auth/v1/factors') && (opciones.method ?? 'GET') === 'GET') {
      return new Response(JSON.stringify({ totp: [] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ id: 'factor-nuevo', totp: { qr_code: '<svg/>', secret: 'JBSWY3DP' } }),
      { status: 200 },
    );
  });

beforeEach(async () => {
  vi.resetModules();
  for (const [k, v] of Object.entries(ENTORNO)) vi.stubEnv(k, v);
  galleta = new Map([
    ['ncr_acceso', TOKEN_DEL_TITULAR],
    ['ncr_refresco', 'refresco'],
    ['ncr_expira', String(Math.floor(Date.now() / 1000) + 300)],
  ]);
  puestas = [];
  fetchFalso = proveedorNormal();
  vi.stubGlobal('fetch', fetchFalso);
  ruta = await import('./route');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Llamada = [string, { method?: string; headers: Record<string, string>; body?: string }];
const llamadas = (): Llamada[] => fetchFalso.mock.calls as unknown as Llamada[];

const llamadaDeAlta = (): Llamada => {
  const alta = llamadas().find(([url, o]) => url.endsWith('/auth/v1/factors') && o.method === 'POST');
  expect(alta).toBeDefined();
  return alta as Llamada;
};

describe('la inscripción opera sobre la propia sesión y sobre ninguna otra', () => {
  it('el alta viaja con el token del llamante y sin ningún identificador de usuario', async () => {
    const res = await ruta.POST();
    expect(res.status).toBe(200);

    const [, opciones] = llamadaDeAlta();
    expect(opciones.headers.Authorization).toBe(`Bearer ${TOKEN_DEL_TITULAR}`);
    // El cuerpo declara QUÉ se inscribe, nunca PARA QUIÉN.
    const cuerpo = JSON.parse(opciones.body ?? '{}') as Record<string, unknown>;
    expect(cuerpo).toEqual({ factor_type: 'totp', friendly_name: expect.any(String) });
    expect(JSON.stringify(cuerpo)).not.toMatch(/user|uid|email|correo/i);
  });

  it('sin sesión no llega a preguntarle nada al proveedor', async () => {
    galleta.clear();
    const res = await ruta.POST();
    expect(res.status).toBe(401);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('devuelve el QR y el secreto en texto, que es la vía de quien no puede escanear', async () => {
    const res = await ruta.POST();
    expect(await res.json()).toEqual({ qr: '<svg/>', secreto: 'JBSWY3DP' });
  });

  it('deja el factor marcado como pendiente para que la verificación pueda cerrar el paso', async () => {
    await ruta.POST();
    expect(puestas).toContainEqual({ nombre: 'ncr_factor', valor: 'factor-nuevo' });
  });

  it('un factor a medio inscribir se retira antes, para no dejar dos secretos vivos', async () => {
    fetchFalso.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ totp: [{ id: 'a-medias', status: 'unverified' }] }), {
          status: 200,
        }),
    );
    await ruta.POST();
    const borrado = llamadas().find(
      ([url, o]) => url.includes('a-medias') && o.method === 'DELETE',
    );
    expect(borrado).toBeDefined();
  });

  it('el límite del proveedor se traslada como 429, no se disfraza de fallo genérico', async () => {
    fetchFalso.mockImplementation(async (url: string, o: { method?: string }) =>
      url.endsWith('/auth/v1/factors') && (o.method ?? 'GET') === 'GET'
        ? new Response(JSON.stringify({ totp: [] }), { status: 200 })
        : new Response('{}', { status: 429 }),
    );
    expect((await ruta.POST()).status).toBe(429);
  });

  it('el proveedor caído es 503, y el mensaje no filtra su respuesta', async () => {
    fetchFalso.mockRejectedValue(new Error('ECONNREFUSED https://proyecto.invalid'));
    const res = await ruta.POST();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain('ECONNREFUSED');
  });
});

/**
 * EL FALLO QUE REPORTÓ EL CLIENTE, reproducido.
 *
 * En el registro se veían dos peticiones seguidas: `503` y luego `200`. Las dos
 * las hace el navegador —el modo estricto de React invoca el efecto dos veces
 * en desarrollo, y un doble clic hace lo mismo en producción—, y las dos
 * entraban aquí a la vez. Cada una lee los factores, borra los que están a
 * medio inscribir y crea uno nuevo: leer y borrar sin atomicidad. La segunda
 * choca con el nombre ya tomado, el proveedor responde 422 y la consola lo
 * traducía a «no se pudo contactar con el servicio de identidad».
 *
 * Estas pruebas fijan la corrección donde importa: **dos peticiones
 * simultáneas del mismo titular producen UNA sola inscripción**, y ninguna de
 * las dos recibe un error.
 */
describe('dos inscripciones simultáneas del mismo titular', () => {
  /**
   * Doble de GoTrue con estado: guarda los factores por nombre, rechaza con
   * 422 el nombre ya tomado y los borra de verdad. Un doble sin estado no
   * podría distinguir «choqué porque otro intento va a la vez» de «choqué
   * siempre», que es justo lo que hay que distinguir aquí.
   */
  const conProveedorConEstado = (): void => {
    const factores = new Map<string, { id: string; friendly_name: string; status: string }>();
    let siguiente = 0;
    fetchFalso.mockImplementation(async (url: string, o: { method?: string; body?: string }) => {
      const metodo = o.method ?? 'GET';
      if (url.endsWith('/auth/v1/factors') && metodo === 'GET') {
        return new Response(JSON.stringify({ totp: [...factores.values()] }), { status: 200 });
      }
      if (url.endsWith('/auth/v1/factors') && metodo === 'POST') {
        const nombre = (JSON.parse(o.body ?? '{}') as { friendly_name?: string }).friendly_name;
        // Latencia real del proveedor: sin ella las dos peticiones se
        // serializan solas y la carrera no se reproduce.
        await new Promise((listo) => setTimeout(listo, 20));
        if ([...factores.values()].some((f) => f.friendly_name === nombre)) {
          // Lo que GoTrue responde a un nombre de factor repetido.
          return new Response(JSON.stringify({ error_code: 'mfa_factor_name_conflict' }), {
            status: 422,
          });
        }
        siguiente += 1;
        const id = `factor-${siguiente}`;
        factores.set(id, { id, friendly_name: nombre ?? '', status: 'unverified' });
        return new Response(
          JSON.stringify({ id, totp: { qr_code: `<svg id="${id}"/>`, secret: 'JBSWY3DP' } }),
          { status: 200 },
        );
      }
      const borrado = /\/factors\/([^/]+)$/.exec(url);
      if (borrado?.[1] !== undefined && metodo === 'DELETE') {
        factores.delete(borrado[1]);
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
  };

  const altasPedidas = (): number =>
    llamadas().filter(([url, o]) => url.endsWith('/auth/v1/factors') && o.method === 'POST').length;

  it('las dos reciben 200 y el mismo QR: nadie ve un 503', async () => {
    conProveedorConEstado();
    const [una, otra] = await Promise.all([ruta.POST(), ruta.POST()]);
    expect([una.status, otra.status]).toEqual([200, 200]);
    expect(await una.json()).toEqual(await otra.json());
  });

  it('el proveedor recibe UNA sola alta, no dos', async () => {
    // Es la corrección de fondo. Reintentar más veces habría escondido la
    // carrera; lo que se arregla es no hacer dos veces la misma operación.
    conProveedorConEstado();
    await Promise.all([ruta.POST(), ruta.POST()]);
    expect(altasPedidas()).toBe(1);
  });

  it('terminada la primera, una inscripción posterior SÍ vuelve a pedir alta', async () => {
    // El deduplicado dura lo que dura la petición. Si persistiera, quien
    // reintentara más tarde recibiría un QR viejo de un factor ya borrado.
    conProveedorConEstado();
    const primera = await ruta.POST();
    const antes = altasPedidas();
    const segunda = await ruta.POST();
    expect(altasPedidas()).toBe(antes + 1);
    // Y el QR es de un factor NUEVO: el anterior se retiró en la limpieza.
    expect(await segunda.json()).not.toEqual(await primera.json());
  });

  it('un conflicto que no es carrera se reintenta una vez y se rinde con 409', async () => {
    // Si el segundo intento también choca, ya no es una carrera: se responde
    // con el motivo real —409, «ya había una inscripción en curso»— y no con
    // un 503 que manda a investigar la red.
    fetchFalso.mockImplementation(async (url: string, o: { method?: string }) =>
      url.endsWith('/auth/v1/factors') && (o.method ?? 'GET') === 'POST'
        ? new Response(JSON.stringify({ error_code: 'mfa_factor_name_conflict' }), { status: 422 })
        : new Response(JSON.stringify({ totp: [] }), { status: 200 }),
    );
    const res = await ruta.POST();
    expect(res.status).toBe(409);
    expect(altasPedidas()).toBe(2);
    expect(JSON.stringify(await res.json())).not.toContain('contactar');
  });
});
