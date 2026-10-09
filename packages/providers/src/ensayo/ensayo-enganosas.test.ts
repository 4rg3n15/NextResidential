import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ensayarEquipo } from './ensayo-en-sitio';
import type { EquipoDeEnsayo, Interlocutor, OpcionesDeEnsayo } from './tipos';
import { aperturasFisicasPor, equipoSimulado } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { servidorRtspSimulado } from '../simulacion/servidor-rtsp';
import type { ServidorRtspSimulado } from '../simulacion/servidor-rtsp';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';
import { pasoDeEventos } from './paso-de-eventos';
import { pasoDeAudio, tonoDePrueba } from './paso-de-audio';
import { pasoDeRostro } from './pasos-de-accion';
import { CAPACIDADES_SIN_CONSULTAR } from '../nucleo/capacidades';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 · LAS TRES RESPUESTAS ENGAÑOSAS DE SITIO Y EL 400 DE LA TERMINAL
 *
 *  1. Cuerpo sin espacio de nombres: «OK» y el relé quieto.
 *  2. Escritura con el cuerpo vacío: `400 badXmlContent` ANTES de autenticar.
 *  3. 2xx sin `statusCode 1`: no es un éxito.
 *
 * Las dos primeras las provoca «algo entre el Mac y el equipo» (se simula con
 * un intermediario que altera el cuerpo): el adaptador de producción manda el
 * documento bueno. La tercera la produce el propio equipo. En las tres, el
 * ensayo NO da por buena la apertura.
 * ═════════════════════════════════════════════════════════════════════════════
 */
const CLAVE = 'p1';
const AHORA = new Date('2026-09-27T14:00:05Z');
let rtsp: ServidorRtspSimulado;
beforeAll(async () => {
  rtsp = await servidorRtspSimulado({
    usuario: 'servicio',
    clave: CLAVE,
    canales: { '102': 'H265' },
  });
});
afterAll(async () => {
  await rtsp.cerrar();
});

const mira = (destino: string): Interlocutor => {
  let antes = 0;
  return {
    indicar: async () => {
      antes = aperturasFisicasPor.get(destino) ?? 0;
    },
    confirmar: async (p) =>
      /pitido/.test(p) ? false : (aperturasFisicasPor.get(destino) ?? 0) > antes,
  };
};

/** Un intermediario que toca el cuerpo de la orden de apertura. */
const intermediario =
  (base: typeof fetch, tocar: (cuerpo: string) => string): typeof fetch =>
  async (u, o) =>
    base(u, {
      ...o,
      ...(/RemoteControl\/door\/\d+$/.test(String(u)) && typeof o?.body === 'string'
        ? { body: tocar(o.body) }
        : {}),
    });

const opciones = (
  familia: EquipoDeEnsayo['familia'],
  destino: string,
  guion: Partial<GuionDeEquipo> = {},
  tocar?: (cuerpo: string) => string,
): OpcionesDeEnsayo => {
  const base = equipoSimulado({
    familia,
    usuario: 'servicio',
    clave: CLAVE,
    destino,
    hora: '2026-09-27T09:00:00-05:00',
    aperturaRemota: true,
    ...guion,
  });
  return {
    equipo: {
      familia,
      host: '127.0.0.1',
      usuario: 'servicio',
      clave: CLAVE,
      puerta: 1,
      canalDeVideo: '102',
      puertoRtsp: rtsp.puerto,
      peticion: tocar === undefined ? base : intermediario(base, tocar),
    },
    interlocutor: mira(destino),
    soloLectura: false,
    plataforma: { primeroDesde: async () => ({ titulo: 'x', ocurridoEn: AHORA }) },
    esperaDeEventoMs: 200,
    limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
    zona: 'America/Bogota',
    ahora: () => AHORA,
  };
};

/** Sin la base a mano: el ensayo se suscribe él mismo al equipo. */
const sinPlataforma = (o: OpcionesDeEnsayo): OpcionesDeEnsayo =>
  Object.fromEntries(
    Object.entries(o).filter(([k]) => k !== 'plataforma'),
  ) as unknown as OpcionesDeEnsayo;

const paso = async (o: OpcionesDeEnsayo, nombre: string) =>
  (await ensayarEquipo(o, async () => undefined)).pasos.find((p) => p.paso === nombre);

describe('las tres respuestas engañosas: el ensayo no las da por buenas', () => {
  it('1 · sin espacio de nombres el equipo dice OK y NO abre: la persona lo desmiente', async () => {
    const o = opciones('terminal', 'enganosa-1', {}, (c) =>
      c.replace(/ xmlns="[^"]+"/, '').replace(/ version="2\.0"/, ''),
    );
    const r = await paso(o, 'apertura');
    expect(r?.estado).toBe('fallo');
    expect(r?.causa).toMatch(/contestó que sí.*y NO se movió/);
    expect(aperturasFisicasPor.get('enganosa-1') ?? 0).toBe(0);
  });

  it('2 · con el cuerpo vacío la terminal contesta 400 badXmlContent antes de autenticar', async () => {
    const o = opciones('terminal', 'enganosa-2', {}, () => '');
    const r = await paso(o, 'apertura');
    expect(r?.estado).toBe('fallo');
    expect(r?.accion).toMatch(/le quita el cuerpo/);
  });

  it('3 · 2xx sin statusCode 1 no es éxito, ni en la puerta ni en la talanquera', async () => {
    for (const familia of ['videoportero', 'camara'] as const) {
      const destino = `enganosa-3-${familia}`;
      const r = await paso(opciones(familia, destino, { aperturaSinConfirmar: true }), 'apertura');
      expect(r?.estado, familia).toBe('fallo');
      expect(aperturasFisicasPor.get(destino) ?? 0).toBe(0);
    }
  });
});

describe('los demás fallos dicen su causa y su acción', () => {
  // A2 (15-S2) · H.265 ya no es un fallo en sí: la misma regla que la API.
  it('H.265 en el subflujo: la sonda no falla y dice Safari directo, Chrome transcodificado', async () => {
    const r = await paso(opciones('camara', 'video-h265'), 'video');
    expect(r?.estado).toBe('ok');
    expect(r?.causa).toMatch(
      /H\.265 por RTSP .*Safari lo reproduce directo; Chrome, sólo transcodificado/,
    );
  });

  it('A5 (15-S2) · H.265 con puente: el ensayo entrega el códec al paso 7, que transcodifica', async () => {
    const vistas: string[] = [];
    const fetchFn: typeof fetch = async (u, o) => {
      vistas.push(`${o?.method ?? 'GET'} ${new URL(String(u)).searchParams.get('name') ?? ''}`);
      return o?.method === 'POST'
        ? new Response('v=0\r\nm=video 9 X 96\r\n', { status: 201 })
        : new Response('', { status: o?.method === undefined ? 404 : 200 });
    };
    const o = { ...opciones('camara', 'video-h265-puente'), puente: { url: 'http://p', fetchFn } };
    const r = await paso(o, 'video');
    expect(r?.estado).toBe('ok');
    expect(r?.causa).toMatch(/\(transcodificado\)/);
    expect(vistas).toContain('PATCH ensayo-camara-h264');
  });

  it('zona horaria equivocada en la cámara: el paso 2 lo dice en horas', async () => {
    const r = await paso(
      opciones('camara', 'zona-mal', { hora: '2026-09-27T14:00:00+00:00' }),
      'hora',
    );
    expect(r?.estado).toBe('fallo');
    expect(r?.causa).toMatch(/Zona horaria equivocada.*5 h/);
  });

  it('la cámara sin plataforma: el evento no se puede comprobar desde aquí', async () => {
    expect((await pasoDeEventos(sinPlataforma(opciones('camara', 'camara-sin-base')))).estado).toBe(
      'omitido',
    );
  });

  it('sin plataforma, la terminal que no emite nada: fallo al vencer el plazo', async () => {
    const r = await pasoDeEventos(
      sinPlataforma(opciones('terminal', 'terminal-muda', { flujo: [] })),
    );
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/no emitió ningún evento en vivo/);
  });

  it('el videoportero con el audio deshabilitado, y el pitido que nadie oye', async () => {
    const o = opciones('videoportero', 'audio');
    expect((await pasoDeAudio(o, CAPACIDADES_SIN_CONSULTAR)).estado).toBe('fallo');
    const conCanal = {
      ...CAPACIDADES_SIN_CONSULTAR,
      audioBidireccional: { estado: 'si' as const, canal: 1, formato: 'g711u' },
    };
    const r = await pasoDeAudio(o, conCanal, async () => undefined);
    expect(r.causa).toBe('El canal se abrió, pero el pitido no se oyó');
    expect((await pasoDeAudio({ ...o, soloLectura: true }, conCanal)).estado).toBe('omitido');
  });

  it('la biblioteca llena: el rostro no entra y lo dice', async () => {
    const o = opciones('terminal', 'llena', { bibliotecaMaximo: 0 });
    const r = await pasoDeRostro(o, null);
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/no aceptó el rostro/);
    expect(r.accion).toMatch(/--foto/);
  });
});

describe('el pitido de prueba (G.711)', () => {
  it('un segundo a 8 kHz en µ-law o A-law; otro formato, ninguno', () => {
    expect(tonoDePrueba('G.711ulaw')?.length).toBe(8000);
    expect(tonoDePrueba('g711a')?.length).toBe(8000);
    // El silencio en µ-law es 0xFF, en A-law 0xD5.
    expect(tonoDePrueba('pcmu')?.[0]).toBe(0xff);
    expect(tonoDePrueba('pcma')?.[0]).toBe(0xd5);
    expect(tonoDePrueba('AAC')).toBeNull();
    expect(tonoDePrueba(null)).toBeNull();
  });
});
