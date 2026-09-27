import { describe, expect, it } from 'vitest';
import { descubrirCapacidades } from './capacidades-hikvision';
import {
  PREGUNTA_DE_CONTROL_DE_ACCESO,
  PREGUNTA_DE_PERSONAS,
  descubrirPersonas,
  motivoDeLaRespuesta,
} from './rostros-y-personas';
import type { RespuestaDeCapacidad } from './rostros-y-personas';
import { ClienteDeEquipo } from '../equipo/cliente';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import type { GuionDeEquipo } from '../simulacion/equipo-simulado';
import { capacidadesDesdeJson } from '../nucleo/capacidades';

/**
 * F4 (corrección de la 15-L) · el videoportero «Ultra» dejó biblioteca y
 * personas en «desconocida» sin decir por qué. Ahora: la ruta DEDICADA de
 * personas primero, la general de respaldo, y el MOTIVO de lo que no se leyó.
 */
const CRED = { usuario: 'servicio', clave: 'p1' } as const;

const descubrir = async (familia: 'terminal' | 'videoportero', guion: Partial<GuionDeEquipo>) => {
  const preguntas: string[] = [];
  const c = await descubrirCapacidades({
    cliente: new ClienteDeEquipo({
      host: `${familia}.f4.invalid`,
      ...CRED,
      peticion: equipoSimulado({ familia, ...CRED, ...guion }),
    }),
    familia,
    traza: { registrar: (_n, _m, contexto) => preguntas.push(String(contexto?.['proposito'])) },
  });
  return { c, preguntas };
};

describe('el motivo, en palabras y con el código DENTRO de la frase', () => {
  it('HTTP, subStatusCode y la pregunta; 404 y un cuerpo mudo, también', () => {
    expect(
      motivoDeLaRespuesta(
        'leer qué admite la biblioteca de rostros',
        400,
        '{"subStatusCode":"badParameters"}',
      ),
    ).toBe(
      'el equipo contestó HTTP 400 (badParameters) a «leer qué admite la biblioteca de rostros»',
    );
    expect(motivoDeLaRespuesta('x', 404, 'not found')).toMatch(/404 \(esa ruta no existe/);
    expect(motivoDeLaRespuesta('x', 500, '')).toBe(
      'el equipo contestó HTTP 500 sin decir por qué a «x»',
    );
  });
});

describe('F4 · el videoportero, con las rutas buenas y su motivo', () => {
  it('con biblioteca: las personas se leen por su ruta DEDICADA, sin ir a la general', async () => {
    const { c, preguntas } = await descubrir('videoportero', { bibliotecaEnVideoportero: true });
    expect(c.bibliotecaDeRostros).toEqual({ estado: 'si', maximo: 5000, almacenadas: 0 });
    expect(c.gestionDePersonas).toBe('si');
    expect('motivoDeGestionDePersonas' in c).toBe(false);
    expect(preguntas).toContain(PREGUNTA_DE_PERSONAS);
    expect(preguntas).not.toContain(PREGUNTA_DE_CONTROL_DE_ACCESO);
  });

  it('la dedicada no contesta: la general de control de acceso es el respaldo', async () => {
    const { c, preguntas } = await descubrir('videoportero', {
      bibliotecaEnVideoportero: true,
      sinSoporte: [PREGUNTA_DE_PERSONAS],
    });
    expect(c.gestionDePersonas).toBe('si');
    expect(preguntas.indexOf(PREGUNTA_DE_PERSONAS)).toBeLessThan(
      preguntas.indexOf(PREGUNTA_DE_CONTROL_DE_ACCESO),
    );
  });

  it('lo que contestó 400 badParameters queda DESCONOCIDA con su motivo, y persiste', async () => {
    const { c } = await descubrir('videoportero', {
      bibliotecaEnVideoportero: true,
      situaciones: { bibliotecaIlegible: true, personasIlegibles: true },
    });
    expect(c.bibliotecaDeRostros.estado).toBe('desconocida');
    expect(c.bibliotecaDeRostros.motivo).toBe(
      'el equipo contestó HTTP 400 (badParameters) a «leer qué admite la biblioteca de rostros» · ' +
        'el equipo contestó HTTP 400 (badParameters) a «contar las plantillas de la biblioteca de rostros»',
    );
    expect(c.gestionDePersonas).toBe('desconocida');
    expect(c.motivoDeGestionDePersonas).toMatch(
      /HTTP 400 \(badParameters\) a «leer qué admite la gestión de personas» · .*«capacidades de control de acceso de la terminal»/,
    );
    // La consola lo guarda en `jsonb` y lo vuelve a leer: el motivo no se pierde.
    const leida = capacidadesDesdeJson(JSON.parse(JSON.stringify(c)));
    expect(leida.bibliotecaDeRostros.motivo).toBe(c.bibliotecaDeRostros.motivo);
    expect(leida.motivoDeGestionDePersonas).toBe(c.motivoDeGestionDePersonas);
  });

  it('sin biblioteca («no admito» a todo): NO, sin motivo', async () => {
    const { c } = await descubrir('videoportero', {});
    expect(c.bibliotecaDeRostros).toEqual({ estado: 'no', maximo: null, almacenadas: null });
    expect(c.gestionDePersonas).toBe('no');
  });
});

describe('F4 · la terminal: un «no admito» a una ruta documentada no es «no puede»', () => {
  it('queda DESCONOCIDA, con el motivo de cada consulta', async () => {
    const { c } = await descubrir('terminal', { sinCapacidades: true });
    expect(c.bibliotecaDeRostros.estado).toBe('desconocida');
    expect(c.bibliotecaDeRostros.motivo).toMatch(/HTTP 200 \(notSupport\).*biblioteca de rostros/);
    expect(c.gestionDePersonas).toBe('desconocida');
    expect(c.motivoDeGestionDePersonas).toMatch(/gestión de personas/);
  });

  it('las capacidades generales ya leídas no se vuelven a pedir', async () => {
    const pedidas: string[] = [];
    const falla: RespuestaDeCapacidad = { cuerpo: null, noAdmite: false, motivo: 'm1' };
    const consultar = async (proposito: string): Promise<RespuestaDeCapacidad> => {
      pedidas.push(proposito);
      return falla;
    };
    const general: RespuestaDeCapacidad = {
      cuerpo: '{"AcsCap":{}}',
      noAdmite: false,
      motivo: null,
    };
    expect(await descubrirPersonas(consultar, 'terminal', general)).toEqual({
      estado: 'si',
      motivo: null,
    });
    expect(pedidas).toEqual([PREGUNTA_DE_PERSONAS]);
  });
});
