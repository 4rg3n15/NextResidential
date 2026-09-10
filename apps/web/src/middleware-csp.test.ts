import { describe, expect, it } from 'vitest';
import { construirCsp, generarNonce } from './middleware-csp';

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

const PRODUCCION = { nonce: 'abc123', desarrollo: false } as const;

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
    expect(directiva(csp({ nonce: 'x', desarrollo: true }), 'script-src')).toContain(
      "'unsafe-eval'",
    );
  });

  it('pero sigue sin admitir unsafe-inline', () => {
    expect(directiva(csp({ nonce: 'x', desarrollo: true }), 'script-src')).not.toContain(
      'unsafe-inline',
    );
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
    const csp = construirCsp({ nonce: 'n', desarrollo: false });
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('style-src-elem');
  });

  it('en desarrollo se relaja style-src-elem, y SOLO él', () => {
    // `next dev` inyecta el CSS con el cargador de webpack, que crea etiquetas
    // <style> sin conocer nuestro nonce. Es un fallo de la herramienta, no del
    // producto: la consola compilada no produce ninguna.
    const csp = construirCsp({ nonce: 'n', desarrollo: true });
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
    const csp = construirCsp({ nonce: 'n', desarrollo: true });
    expect(csp).not.toContain('style-src-attr');
    expect(csp).toContain("style-src 'self' 'nonce-n';");
  });
});
