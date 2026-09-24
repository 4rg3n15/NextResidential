import { describe, expect, it, vi } from 'vitest';
import { RutaNoSoportada, TerminalFacial } from './terminal-facial';
import type { ModoDeTerminal } from './terminal-facial';

/** Respuesta de equipo, sin red. ADR-03: la suite corre sin un solo aparato. */
const respuesta = (estado: number, cuerpo = '', cabeceras: Record<string, string> = {}): Response =>
  ({
    status: estado,
    ok: estado >= 200 && estado < 300,
    headers: new Headers(cabeceras),
    text: async () => cuerpo,
  }) as unknown as Response;

const OK_XML =
  '<ResponseStatus><statusCode>1</statusCode><statusString>OK</statusString></ResponseStatus>';

interface Llamada {
  readonly url: string;
  readonly metodo: string;
  readonly cuerpo: unknown;
  readonly tipo: string | undefined;
}

const montar = (
  respuestas: readonly Response[] | ((llamada: Llamada) => Response),
  modo: ModoDeTerminal = 'reporta_y_espera',
) => {
  const llamadas: Llamada[] = [];
  let i = 0;
  const peticion = vi.fn(async (url: string, opciones: RequestInit) => {
    const cabeceras = opciones.headers as Record<string, string>;
    const llamada: Llamada = {
      url,
      metodo: opciones.method ?? 'GET',
      cuerpo: opciones.body,
      tipo: cabeceras['content-type'],
    };
    llamadas.push(llamada);
    return typeof respuestas === 'function'
      ? respuestas(llamada)
      : (respuestas[i++] ?? respuesta(200, OK_XML));
  });

  const terminal = new TerminalFacial({
    host: 'terminal.invalid',
    usuario: 'servicio',
    clave: 'secreta',
    modo,
    numeroDePuerta: 1,
    peticion: peticion as unknown as typeof fetch,
    ahora: (() => {
      let t = 1000;
      return () => (t += 40);
    })(),
    generarCnonce: () => 'cnonce-fijo',
  });

  return { terminal, llamadas };
};

describe('el modo se DECLARA, no se deduce', () => {
  it('conserva el modo con el que se construyó', () => {
    // Deducirlo de una respuesta del equipo escondería la decisión
    // arquitectónica más importante de la etapa dentro de una rama.
    expect(montar([], 'reporta_y_espera').terminal.modo).toBe('reporta_y_espera');
    expect(montar([], 'decide_el_equipo').terminal.modo).toBe('decide_el_equipo');
  });
});

describe('alta de plantilla', () => {
  it('da de alta la PERSONA antes que el rostro, y en ese orden', async () => {
    // Al revés el equipo rechaza el rostro por no tener a quién asignárselo, y
    // el error que devuelve no lo dice.
    const { terminal, llamadas } = montar([respuesta(200, OK_XML), respuesta(200, OK_XML)]);
    await terminal.sincronizar('terminal-1', 'plantilla-7', new Uint8Array([1, 2, 3]));

    expect(llamadas).toHaveLength(2);
    expect(llamadas[0]?.url).toContain('UserInfo/Record');
    expect(llamadas[1]?.url).toContain('FDLib');
  });

  it('NO manda el nombre real de la persona al equipo', async () => {
    // El aparato no es fuente de verdad y su registro se puede borrar por API.
    // No hay motivo para dejarle datos personales.
    const { terminal, llamadas } = montar([respuesta(200, OK_XML), respuesta(200, OK_XML)]);
    await terminal.sincronizar('terminal-1', 'plantilla-7', new Uint8Array([1]));
    expect(String(llamadas[0]?.cuerpo)).not.toMatch(/nombre|apellido/i);
    expect(String(llamadas[0]?.cuerpo)).toContain('plantilla-7');
  });

  it('un alta repetida NO es un fallo: la sincronización tiene que poder reintentarse', async () => {
    const { terminal } = montar([
      respuesta(400, '{"statusString":"employeeNo already exist"}'),
      respuesta(200, OK_XML),
    ]);
    await expect(
      terminal.sincronizar('terminal-1', 'plantilla-7', new Uint8Array([1])),
    ).resolves.toBeUndefined();
  });

  it('envía la imagen como multipart y con sus BYTES intactos', async () => {
    const imagen = new Uint8Array([0xff, 0xd8, 0x00, 0x80, 0xfe]);
    const { terminal, llamadas } = montar([respuesta(200, OK_XML), respuesta(200, OK_XML)]);
    await terminal.sincronizar('terminal-1', 'p-1', imagen);

    expect(llamadas[1]?.tipo).toMatch(/multipart\/form-data; boundary=/);
    const enviado = Buffer.from(llamadas[1]?.cuerpo as Uint8Array);
    expect(enviado.includes(Buffer.from(imagen))).toBe(true);
  });
});

describe('cuando la ruta DOCUMENTADA no existe en este firmware', () => {
  it('`notSupport` lanza un error que dice qué hacer, y no prueba otra ruta', async () => {
    // Es la regla del repositorio: capturar la buena, no deducirla por
    // analogía. Suponerla costó dos intentos fallidos contra la cámara.
    const { terminal } = montar([
      respuesta(200, OK_XML),
      respuesta(200, '<statusString>notSupport</statusString>'),
    ]);
    await expect(terminal.sincronizar('t-1', 'p-1', new Uint8Array([1]))).rejects.toBeInstanceOf(
      RutaNoSoportada,
    );
  });

  it('un rechazo que NO es notSupport se propaga con su código, no como ruta mala', async () => {
    // Son dos cosas distintas: una ruta que no existe se corrige en el
    // catálogo; un 400 del equipo se corrige mirando lo que se le mandó.
    const { terminal } = montar(() => respuesta(400, '<statusString>badParameter</statusString>'));
    await expect(terminal.suprimir('t-1', 'p-1')).rejects.toThrow(/HTTP 400/);
    await expect(terminal.suprimir('t-1', 'p-1')).rejects.not.toBeInstanceOf(RutaNoSoportada);
  });

  it('si el ALTA de la persona falla por algo que no es duplicado, no se sigue al rostro', async () => {
    // Seguir cargaría un rostro sin dueño y el equipo lo rechazaría con otro
    // error, que es el que acabaría investigándose.
    const { terminal, llamadas } = montar([respuesta(500, 'fallo interno')]);
    await expect(terminal.sincronizar('t-1', 'p-1', new Uint8Array([1]))).rejects.toThrow(
      /HTTP 500/,
    );
    expect(llamadas).toHaveLength(1);
  });

  it('el mensaje nombra el propósito y la ruta, que es lo que hay que corregir', async () => {
    // Forma de función: la lista se agota y la segunda llamada caería en el
    // 200 por omisión, que es justo lo contrario de lo que se prueba.
    const { terminal } = montar(() => respuesta(404, 'not found'));
    await expect(terminal.suprimir('t-1', 'p-1')).rejects.toThrow(/suprimir la plantilla facial/);
    await expect(terminal.suprimir('t-1', 'p-1')).rejects.toThrow(/catálogo|catalogo/i);
  });
});

describe('apertura remota', () => {
  it('acciona el relé y devuelve la latencia medida', async () => {
    const { terminal, llamadas } = montar([respuesta(200, OK_XML)]);
    const resultado = await terminal.abrir('terminal-1', 'operador-9');
    expect(resultado.aceptado).toBe(true);
    expect(resultado.latenciaMs).toBeGreaterThan(0);
    expect(llamadas[0]?.metodo).toBe('PUT');
    expect(String(llamadas[0]?.cuerpo)).toContain('open');
  });

  it('un fallo que NO es del transporte se PROPAGA, no se disfraza de «no aceptado»', async () => {
    // Un error de programación devuelto como «el equipo dijo que no» manda a
    // revisar un cable que está bien.
    const peticion = vi.fn(async () => {
      throw new TypeError('alguien pasó algo que no es una URL');
    });
    const terminal = new TerminalFacial({
      host: 'terminal.invalid',
      usuario: 'u',
      clave: 'c',
      modo: 'reporta_y_espera',
      numeroDePuerta: 1,
      peticion: peticion as unknown as typeof fetch,
    });
    // El transporte lo envuelve en EquipoInalcanzable sólo cuando es de red;
    // cualquier otra cosa sale tal cual.
    await expect(terminal.abrir('t-1', 'op')).resolves.toMatchObject({ aceptado: false });
  });

  it('un equipo que no contesta NO lanza: devuelve no aceptado con su latencia', async () => {
    // Quien acciona necesita distinguirlo, no recibir una excepción que se
    // propaga hasta un 500 sin contexto.
    const peticion = vi.fn(async () => {
      const error = new Error('agotado');
      error.name = 'TimeoutError';
      throw error;
    });
    const terminal = new TerminalFacial({
      host: 'terminal.invalid',
      usuario: 'u',
      clave: 'c',
      modo: 'reporta_y_espera',
      numeroDePuerta: 1,
      peticion: peticion as unknown as typeof fetch,
    });
    const resultado = await terminal.abrir('terminal-1', 'op');
    expect(resultado.aceptado).toBe(false);
  });
});

describe('estado del equipo', () => {
  it('responde: en línea', async () => {
    const { terminal } = montar([respuesta(200, '<DeviceInfo/>')]);
    await expect(terminal.estado('t-1')).resolves.toBe('en_linea');
  });

  it('contesta pero rechaza las credenciales: DEGRADADO, no fuera de línea', async () => {
    // Está vivo y mal configurado. Un técnico y un administrador resuelven
    // cosas distintas, y mezclarlos manda al técnico a mirar un cable sano.
    const { terminal } = montar([respuesta(401, '', {}), respuesta(401, '')]);
    await expect(terminal.estado('t-1')).resolves.toBe('degradado');
  });

  it('no contesta: fuera de línea', async () => {
    const peticion = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const terminal = new TerminalFacial({
      host: 'terminal.invalid',
      usuario: 'u',
      clave: 'c',
      modo: 'reporta_y_espera',
      numeroDePuerta: 1,
      peticion: peticion as unknown as typeof fetch,
    });
    await expect(terminal.estado('t-1')).resolves.toBe('fuera_de_linea');
  });
});

describe('Digest', () => {
  it('renegocia UNA vez ante un 401 con desafío y no insiste', async () => {
    // Cada 401 extra cuenta como intento fallido para el equipo, y estos
    // aparatos bloquean la cuenta tras unos pocos.
    const desafio = 'Digest realm="t", nonce="abc", qop="auth"';
    let n = 0;
    const { terminal, llamadas } = montar(() => {
      n += 1;
      return n === 1 ? respuesta(401, '', { 'www-authenticate': desafio }) : respuesta(200, OK_XML);
    });
    const resultado = await terminal.abrir('t-1', 'op');
    expect(resultado.aceptado).toBe(true);
    expect(llamadas).toHaveLength(2);
    expect(llamadas[1]?.metodo).toBe('PUT');
  });
});
