import { describe, expect, it } from 'vitest';
import { pasoDeApertura, pasoDeRostro } from './pasos-de-accion';
import { pasoDeAudio } from './paso-de-audio';
import type { EquipoDeEnsayo, Interlocutor, OpcionesDeEnsayo } from './tipos';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { jpegConMedidas } from '../simulacion/imagenes-de-prueba';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';
import { CAPACIDADES_SIN_CONSULTAR } from '../nucleo/capacidades';

/**
 * J1 · pasos 5, 6 y 8: las ramas que en sitio significan cosas distintas —
 * nadie contestó, la puerta tardó, la persona no se pudo borrar, el canal no
 * abre— cada una con su causa, contra el simulado.
 */
const AHORA = new Date('2026-09-27T14:00:00Z');
const contesta = (movio: boolean | null, oyo: boolean | null = true): Interlocutor => ({
  indicar: async () => undefined,
  confirmar: async (p) => (/pitido/.test(p) ? oyo : movio),
});

const opciones = (
  familia: EquipoDeEnsayo['familia'],
  interlocutor: Interlocutor,
  guion: Partial<GuionDeEquipo> = {},
  peticion?: typeof fetch,
): OpcionesDeEnsayo => ({
  equipo: {
    familia,
    host: `${familia}.acciones.invalid`,
    usuario: 'servicio',
    clave: 'p1',
    puerta: 1,
    canalDeVideo: '102',
    puertoRtsp: 554,
    peticion:
      peticion ??
      equipoSimulado({ familia, usuario: 'servicio', clave: 'p1', aperturaRemota: true, ...guion }),
  },
  interlocutor,
  soloLectura: false,
  esperaDeEventoMs: 100,
  limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
  zona: 'America/Bogota',
  ahora: () => AHORA,
});

const CON_AUDIO = {
  ...CAPACIDADES_SIN_CONSULTAR,
  audioBidireccional: { estado: 'si' as const, canal: 1, formato: 'g711u' },
};

describe('paso 5 · apertura', () => {
  it('nadie mira la talanquera: aceptada no es verificada', async () => {
    const r = await pasoDeApertura(opciones('camara', contesta(null)));
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/nadie confirmó/);
  });

  it('la talanquera se levanta pero tarda más de 3 s', async () => {
    const base = equipoSimulado({ familia: 'camara', usuario: 'servicio', clave: 'p1' });
    let t = 0;
    const lento: typeof fetch = async (u, o) => base(u, o);
    const o = opciones('camara', contesta(true), {}, lento);
    const r = await pasoDeApertura({
      ...o,
      equipo: { ...o.equipo, ahora: () => (t += 1600) },
    });
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/tardó \d+ ms \(límite 3 s\)/);
  });

  it('la cámara que no contesta: la causa, no un error crudo', async () => {
    const caida: typeof fetch = async () => {
      throw new TypeError('fetch failed');
    };
    const r = await pasoDeApertura(opciones('camara', contesta(true), {}, caida));
    expect(r.estado).toBe('fallo');
    expect(r.accion).toMatch(/Repita/);
  });

  it('el videoportero que no admite la apertura desde la plataforma', async () => {
    const r = await pasoDeApertura(
      opciones('videoportero', contesta(true), {
        sinSoporte: ['abrir la puerta del videoportero'],
      }),
    );
    expect(r.estado).toBe('fallo');
    expect(r.accion).toMatch(/número de puerta/);
  });
});

describe('paso 6 · rostro', () => {
  it('con una foto real admisible: alta, búsqueda y baja', async () => {
    const r = await pasoDeRostro(
      { ...opciones('terminal', contesta(true)), foto: jpegConMedidas(640, 480) },
      null,
    );
    expect(r.estado).toBe('ok');
  });

  it('la persona que no se pudo dar de baja se dice, con su número para borrarla', async () => {
    const r = await pasoDeRostro(
      opciones('terminal', contesta(true), {
        sinSoporte: ['dar de baja a la persona y con ella su plantilla'],
      }),
      null,
    );
    expect(r.estado).toBe('fallo');
    expect(r.accion).toMatch(/Bórrela a mano .*ENSAYO|Bórrela a mano/);
  });

  it('el rostro rechazado con foto real pide otra foto, no --foto', async () => {
    const r = await pasoDeRostro(
      {
        ...opciones('terminal', contesta(true), { bibliotecaMaximo: 0 }),
        foto: jpegConMedidas(640, 480),
      },
      null,
    );
    expect(r.accion).toMatch(/otra foto/);
  });

  it('el videoportero sin biblioteca no aplica; en solo lectura, omitido', async () => {
    expect((await pasoDeRostro(opciones('videoportero', contesta(true)), null)).estado).toBe(
      'no_aplica',
    );
    const o = { ...opciones('terminal', contesta(true)), soloLectura: true };
    expect((await pasoDeRostro(o, null)).estado).toBe('omitido');
  });
});

describe('paso 8 · audio', () => {
  it('un formato que no es G.711: canal abierto y cerrado, sin pitido', async () => {
    const r = await pasoDeAudio(
      opciones('videoportero', contesta(true)),
      { ...CON_AUDIO, audioBidireccional: { estado: 'si', canal: 1, formato: 'aac' } },
      async () => undefined,
    );
    expect(r.estado).toBe('ok');
    expect(r.causa).toMatch(/no se envió pitido/);
  });

  it('nadie contesta si se oyó; y el canal que el equipo no abre', async () => {
    const r = await pasoDeAudio(
      opciones('videoportero', contesta(true, null)),
      CON_AUDIO,
      async () => undefined,
    );
    expect(r.causa).toMatch(/nadie confirmó/);
    const cerrado = await pasoDeAudio(
      opciones('videoportero', contesta(true), {
        sinSoporte: ['abrir el canal de audio bidireccional'],
      }),
      CON_AUDIO,
      async () => undefined,
    );
    expect(cerrado.estado).toBe('fallo');
    expect(cerrado.accion).toMatch(/Repita/);
  });

  it('la cámara no lleva audio, aunque lo declare', async () => {
    expect((await pasoDeAudio(opciones('camara', contesta(true)), CON_AUDIO)).causa).toMatch(
      /habla por el videoportero/,
    );
  });
});
