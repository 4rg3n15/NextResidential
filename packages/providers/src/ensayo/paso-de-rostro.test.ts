import { describe, expect, it } from 'vitest';
import { pasoDeRostro } from './paso-de-rostro';
import type { EquipoDeEnsayo, OpcionesDeEnsayo } from './tipos';
import { CAPACIDADES_SIN_CONSULTAR } from '../nucleo/capacidades';
import type { CapacidadesDeEquipo } from '../nucleo/capacidades';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { personasPor } from '../simulacion/personas-simuladas';
import { LIMITES_DE_FOTO_POR_OMISION } from '../terminal/foto-del-rostro';

/**
 * Paso 6 · el rostro de prueba también en el VIDEOPORTERO que declara
 * biblioteca (F4), y la espera que destapa a la otra plataforma que lo borra
 * (C7): alta → búsqueda → espera → búsqueda → baja.
 */
const CRED = { usuario: 'servicio', clave: 'p1' } as const;

const opciones = (
  familia: EquipoDeEnsayo['familia'],
  destino: string,
  guion: Partial<GuionDeEquipo> = {},
  envolver: (f: typeof fetch) => typeof fetch = (f) => f,
): OpcionesDeEnsayo => ({
  equipo: {
    familia,
    host: destino,
    ...CRED,
    puerta: 1,
    canalDeVideo: '102',
    puertoRtsp: 554,
    peticion: envolver(equipoSimulado({ familia, ...CRED, destino, ...guion })),
  },
  interlocutor: { indicar: async () => undefined, confirmar: async () => true },
  soloLectura: false,
  esperaDeEventoMs: 100,
  limitesDeFoto: LIMITES_DE_FOTO_POR_OMISION,
  zona: 'America/Bogota',
  ahora: () => new Date(),
  esperaDeSincronizacionMs: 60_000,
});

const biblioteca = (
  estado: CapacidadesDeEquipo['bibliotecaDeRostros']['estado'],
  motivo?: string,
): CapacidadesDeEquipo => ({
  ...CAPACIDADES_SIN_CONSULTAR,
  bibliotecaDeRostros: {
    estado,
    maximo: null,
    almacenadas: null,
    ...(motivo === undefined ? {} : { motivo }),
  },
});

describe('F4 · el videoportero con biblioteca: el mismo alta y baja que la terminal', () => {
  it('declara biblioteca: alta, búsqueda tras la espera, supresión y baja', async () => {
    const destino = 'videoportero-rostro.invalid';
    const esperas: number[] = [];
    const r = await pasoDeRostro(
      opciones('videoportero', destino, { bibliotecaEnVideoportero: true }),
      biblioteca('si'),
      async (ms) => {
        esperas.push(ms);
      },
    );
    expect(r.estado).toBe('ok');
    expect(r.causa).toMatch(/seguía en el equipo a los 60 s, supresión verificada/);
    expect(esperas).toEqual([60_000]);
    expect(personasPor.get(destino)?.size).toBe(0);
  });

  it('no se pudo leer: FALLO con el motivo del equipo, no «no aplica»', async () => {
    const motivo = 'el equipo contestó HTTP 400 (badParameters) a «leer qué admite…»';
    const r = await pasoDeRostro(
      opciones('videoportero', 'videoportero-ilegible.invalid'),
      biblioteca('desconocida', motivo),
    );
    expect(r.estado).toBe('fallo');
    expect(r.causa).toBe(
      `No se pudo leer si el videoportero tiene biblioteca de rostros: ${motivo}`,
    );
    expect(r.accion).toMatch(/Probar conexión/);
    const sinMotivo = await pasoDeRostro(
      opciones('videoportero', 'videoportero-mudo.invalid'),
      biblioteca('desconocida'),
    );
    expect(sinMotivo.causa).toMatch(/el equipo no dijo por qué/);
  });
});

describe('C7 · otra plataforma que borra el rostro durante la espera', () => {
  it('estaba al darlo de alta y a los 60 s no: FALLO que nombra a HikCentral', async () => {
    const destino = 'terminal-hikcentral.invalid';
    let reloj = 0;
    const r = await pasoDeRostro(
      opciones('terminal', destino, {
        situaciones: { otraPlataformaBorraRostrosTrasMs: 60_000, ahora: () => reloj },
      }),
      null,
      async (ms) => {
        reloj += ms;
      },
    );
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(
      /DESAPARECIÓ del equipo en 60 s: otra plataforma —p\. ej\. HikCentral— sincronizó el equipo y borró el rostro/,
    );
    expect(r.accion).toMatch(/^Deshabilite el equipo en HikCentral durante la prueba/);
    // La persona de prueba se da de baja igual: nada nuestro queda.
    expect(personasPor.get(destino)?.size).toBe(0);
  });

  it('una espera corta se dice en milisegundos', async () => {
    const o = { ...opciones('terminal', 'terminal-corta.invalid'), esperaDeSincronizacionMs: 200 };
    const r = await pasoDeRostro(o, null, async () => undefined);
    expect(r.causa).toMatch(/a los 200 ms/);
  });

  it('el equipo que no contesta a la segunda búsqueda: OK con el aviso', async () => {
    const r = await pasoDeRostro(
      opciones('terminal', 'terminal-sin-busqueda.invalid', {
        sinSoporte: ['buscar una plantilla en la biblioteca de rostros'],
      }),
      null,
      async () => undefined,
    );
    expect(r.estado).toBe('ok');
    expect(r.detalle.join('\n')).toMatch(/⚠ a los 60 s el equipo no contestó a la búsqueda/);
  });

  it('la supresión que no se verifica: la persona pudo QUEDAR, y se dice', async () => {
    // La búsqueda siempre la encuentra: ni tras suprimir desaparece.
    const siempre = (f: typeof fetch): typeof fetch =>
      (async (u: string | URL, o?: RequestInit) => {
        const r = await f(u, o);
        return /FDSearch$/.test(new URL(String(u)).pathname) && r.status === 200
          ? new Response('{"numOfMatches":1,"totalMatches":1}', { status: 200 })
          : r;
      }) as typeof fetch;
    const r = await pasoDeRostro(
      opciones('terminal', 'terminal-persistente.invalid', {}, siempre),
      null,
      async () => undefined,
    );
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/pudo QUEDAR en el equipo: .*SIGUE en su biblioteca/);
  });

  it('la baja que ni se pudo pedir: la persona pudo QUEDAR, con el motivo', async () => {
    // El equipo se cae justo al dar de baja a la persona.
    const caeEnLaBaja = (f: typeof fetch): typeof fetch =>
      (async (u: string | URL, o?: RequestInit) => {
        if (/UserInfoDetail\/Delete$/.test(new URL(String(u)).pathname)) {
          throw new TypeError('fetch failed');
        }
        return f(u, o);
      }) as typeof fetch;
    const r = await pasoDeRostro(
      opciones('terminal', 'terminal-caida.invalid', {}, caeEnLaBaja),
      null,
      async () => undefined,
    );
    expect(r.estado).toBe('fallo');
    expect(r.causa).toMatch(/^La persona de prueba pudo QUEDAR en el equipo: /);
    expect(r.accion).toMatch(/Bórrela a mano en el panel web \(Persona → buscar ENSAYO/);
  });
});
