import { describe, expect, it } from 'vitest';
import { construirCsp, peticionLlegoPorHttps, generarNonce } from './middleware-csp';

/**
 * La CSP es una cadena, y una cadena mal formada no da error: simplemente deja
 * de proteger. Estas pruebas fijan lo que §2.7.7 exige, directiva a directiva.
 */
const csp = (opciones: Parameters<typeof construirCsp>[0]): string => construirCsp(opciones);
const directiva = (politica: string, nombre: string): string | undefined =>
  politica
    .split('; ')
    .find((d) => d.startsWith(`${nombre} `) || d === nombre)
    ?.slice(nombre.length)
    .trim();

const PRODUCCION = { nonce: 'abc123', desarrollo: false, peticionSegura: true } as const;

describe('generarNonce', () => {
  it('produce un valor distinto en cada llamada', () => {
    const nonces = new Set(Array.from({ length: 200 }, generarNonce));
    // Un nonce repetido convierte la política en una lista blanca estática: el
    // atacante que vea uno puede reutilizarlo.
    expect(nonces.size).toBe(200);
  });

  it('tiene al menos 128 bits de entropía', () => {
    // 16 bytes en base64 son 24 caracteres con relleno.
    expect(generarNonce()).toHaveLength(24);
  });
});

describe('construirCsp en producción', () => {
  it('script-src lleva el nonce y NO lleva unsafe-inline ni unsafe-eval', () => {
    const scripts = directiva(csp(PRODUCCION), 'script-src') ?? '';
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).not.toContain('unsafe-inline');
    expect(scripts).not.toContain('unsafe-eval');
  });

  it('style-src lleva el nonce y tampoco admite unsafe-inline', () => {
    const estilos = directiva(csp(PRODUCCION), 'style-src') ?? '';
    expect(estilos).toContain("'nonce-abc123'");
    expect(estilos).not.toContain('unsafe-inline');
  });

  it('ninguna directiva usa el comodín', () => {
    // Un `*` en cualquier directiva anula la política sin que nada falle.
    expect(csp(PRODUCCION)).not.toMatch(/(^|\s)\*(\s|;|$)/);
  });

  it('object-src, frame-ancestors, base-uri y form-action están cerrados', () => {
    const politica = csp(PRODUCCION);
    expect(directiva(politica, 'object-src')).toBe("'none'");
    expect(directiva(politica, 'frame-ancestors')).toBe("'none'");
    expect(directiva(politica, 'base-uri')).toBe("'self'");
    expect(directiva(politica, 'form-action')).toBe("'self'");
  });

  it('fuerza HTTPS', () => {
    expect(csp(PRODUCCION)).toContain('upgrade-insecure-requests');
  });

  it('connect-src se limita a orígenes propios cuando no hay API externa', () => {
    expect(directiva(csp(PRODUCCION), 'connect-src')).toBe("'self'");
  });

  it('admite el origen de la API y el del puente de vídeo cuando se declaran', () => {
    const politica = csp({
      ...PRODUCCION,
      origenApi: 'https://api.ncr.example',
      origenVideo: 'https://video.ncr.example',
    });
    expect(directiva(politica, 'connect-src')).toBe(
      "'self' https://api.ncr.example https://video.ncr.example",
    );
    expect(directiva(politica, 'media-src')).toContain('https://video.ncr.example');
  });

  it('una variable vacía no mete una cadena vacía en la directiva', () => {
    // Sin el filtro, `connect-src 'self'  ;` invalida la directiva entera.
    const politica = csp({ ...PRODUCCION, origenApi: '', origenVideo: undefined });
    expect(directiva(politica, 'connect-src')).toBe("'self'");
    expect(politica).not.toContain('  ');
  });
});

describe('construirCsp en desarrollo', () => {
  it('admite unsafe-eval, que Next necesita para el refresco en caliente', () => {
    expect(
      directiva(csp({ nonce: 'x', desarrollo: true, peticionSegura: false }), 'script-src'),
    ).toContain("'unsafe-eval'");
  });

  it('pero sigue sin admitir unsafe-inline', () => {
    expect(
      directiva(csp({ nonce: 'x', desarrollo: true, peticionSegura: false }), 'script-src'),
    ).not.toContain('unsafe-inline');
  });

  it('la excepción NO se cuela en producción', () => {
    // Es la comprobación que importa: una excepción de desarrollo que sobrevive
    // al despliegue es la forma habitual de perder la política entera.
    expect(csp(PRODUCCION)).not.toContain('unsafe-eval');
  });
});

/**
 * D-63 · las tres violaciones de `/acceso`, y el defecto que destaparon.
 */
describe('style-src: lo que se relaja y lo que no', () => {
  it('en producción NO hay unsafe-inline en ninguna directiva de estilo', () => {
    const csp = construirCsp({ nonce: 'n', desarrollo: false, peticionSegura: true });
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('style-src-elem');
  });

  it('en desarrollo se relaja style-src-elem, y SOLO él', () => {
    // `next dev` inyecta el CSS con el cargador de webpack, que crea etiquetas
    // <style> sin conocer nuestro nonce. Es un fallo de la herramienta, no del
    // producto: la consola compilada no produce ninguna.
    const csp = construirCsp({ nonce: 'n', desarrollo: true, peticionSegura: false });
    expect(csp).toContain("style-src-elem 'self' 'nonce-n' 'unsafe-inline'");
  });

  it('y los ATRIBUTOS style siguen bloqueados también en desarrollo', () => {
    /**
     * Lo que hace aceptable la excepción de arriba. `style-src-attr` no se
     * declara, así que hereda de `style-src`, que sigue estricto. Ese es el
     * control que destapó que los gráficos del tablero emitían
     * `style="height:37%"` y salían a cero en producción: relajar `style-src`
     * entero habría apagado justo el control que encontró el defecto.
     */
    const csp = construirCsp({ nonce: 'n', desarrollo: true, peticionSegura: false });
    expect(csp).not.toContain('style-src-attr');
    expect(csp).toContain("style-src 'self' 'nonce-n';");
  });
});

/**
 * D-67 · LA DIRECTIVA QUE ROMPÍA LA CONSOLA POR IP DE RED
 *
 * `upgrade-insecure-requests` se emitía por `NODE_ENV === 'production'`, sin
 * mirar cómo se había alcanzado la página. Entrando por la IP de red a la
 * consola compilada, el navegador reescribía CSS y JavaScript a `https://`
 * contra un servidor que no habla TLS, y la consola salía en texto plano.
 *
 * Por `localhost` no pasaba —el bucle local es «potencialmente seguro» y el
 * navegador se salta la subida— y por eso ninguna prueba lo veía: el recorrido
 * del navegador corre sobre `127.0.0.1`, que es justo el caso exento.
 */
describe('D-67 · upgrade-insecure-requests depende de la PETICIÓN', () => {
  it('en producción por HTTPS, se emite', () => {
    expect(csp({ nonce: 'n', desarrollo: false, peticionSegura: true })).toContain(
      'upgrade-insecure-requests',
    );
  });

  it('en producción por HTTP, NO se emite: rompería todos los subrecursos', () => {
    expect(csp({ nonce: 'n', desarrollo: false, peticionSegura: false })).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('quitarla no relaja NINGUNA otra directiva', () => {
    // La mitad que importa de este arreglo: lo único que cambia entre servir
    // por HTTP y por HTTPS es esa directiva. Si alguien «arreglara» el fallo
    // aflojando `style-src`, esto se pondría rojo.
    const seguro = csp({ nonce: 'n', desarrollo: false, peticionSegura: true });
    const inseguro = csp({ nonce: 'n', desarrollo: false, peticionSegura: false });
    expect(`${inseguro}; upgrade-insecure-requests`).toBe(seguro);
  });

  it('nunca en desarrollo, sea cual sea el esquema', () => {
    expect(csp({ nonce: 'n', desarrollo: true, peticionSegura: true })).not.toContain(
      'upgrade-insecure-requests',
    );
  });
});

describe('esquema real de la petición', () => {
  it('detrás de un proxy manda `x-forwarded-proto`', () => {
    // Sin esto, el salto interno del proxy es HTTP y la directiva desaparecería
    // en un despliegue que SÍ es HTTPS: el arreglo se comería su propio motivo.
    expect(peticionLlegoPorHttps('https', 'http:')).toBe(true);
    expect(peticionLlegoPorHttps('http', 'https:')).toBe(false);
  });

  it('con proxies encadenados vale el primero, que es el del cliente', () => {
    expect(peticionLlegoPorHttps('https, http', 'http:')).toBe(true);
    expect(peticionLlegoPorHttps(' HTTPS ,http', 'http:')).toBe(true);
  });

  it('sin cabecera, decide el protocolo de la propia URL', () => {
    expect(peticionLlegoPorHttps(null, 'https:')).toBe(true);
    expect(peticionLlegoPorHttps(undefined, 'http:')).toBe(false);
    expect(peticionLlegoPorHttps('   ', 'https:')).toBe(true);
  });
});

/**
 * ETAPA 10 · la evidencia llega del BUCKET, no de la API.
 *
 * Quedó anotado como aviso al cerrar la 09 y se resuelve antes de construir la
 * portería: `img-src` listaba `'self'`, `data:`, `blob:` y el origen de la API,
 * y la URL firmada apunta a Supabase Storage. La primera miniatura de un evento
 * habría salido rota, con la queja en un sitio que nadie mira.
 */
describe('img-src admite el origen de la evidencia', () => {
  const conBucket = {
    ...PRODUCCION,
    origenApi: 'https://api.ejemplo.co',
    origenEvidencia: 'https://proyecto.supabase.co',
  };

  it('lista el origen del bucket', () => {
    expect(directiva(csp(conBucket), 'img-src')).toContain('https://proyecto.supabase.co');
  });

  it('sin declararlo, no aparece: no se inventa un origen', () => {
    expect(
      directiva(csp({ ...PRODUCCION, origenApi: 'https://api.ejemplo.co' }), 'img-src'),
    ).not.toContain('supabase');
  });

  it('el bucket entra en `img-src` y NO en `connect-src`', () => {
    // La consola no habla con Storage por `fetch`: sólo pinta la imagen. Abrir
    // `connect-src` sería ampliar la superficie sin que nadie lo necesite.
    expect(directiva(csp(conBucket), 'connect-src')).not.toContain('supabase');
  });

  it('sigue sin admitir cualquier origen', () => {
    // Se miran las FUENTES sueltas, no la cadena: los propios orígenes empiezan
    // por `https:`, así que buscarlo en el texto daría un rojo que no lo es.
    // Lo prohibido es `https:` o `*` **como fuente**, que abriría img-src entero.
    const fuentes = (directiva(csp(conBucket), 'img-src') ?? '')
      .split(' ')
      .filter((f) => f !== 'img-src');
    expect(fuentes).not.toContain('*');
    expect(fuentes).not.toContain('https:');
    expect(fuentes).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://api.ejemplo.co',
      'https://proyecto.supabase.co',
    ]);
  });
});
