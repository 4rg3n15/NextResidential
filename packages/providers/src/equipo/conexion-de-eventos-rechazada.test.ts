import { describe, expect, it } from 'vitest';
import {
  REMEDIO_OTRA_PLATAFORMA,
  clasificarConexionDeEventosRechazada,
} from './conexion-de-eventos-rechazada';
import { EscuchaDeAlertStream } from './escucha-alertstream';
import { equipoSimulado } from '../simulacion/equipo-simulado';
import {
  RECHAZO_POR_LIMITE,
  RECHAZO_POR_OTRA_PLATAFORMA,
} from '../simulacion/situaciones-de-sitio';
import type { SituacionesDeSitio } from '../simulacion/situaciones-de-sitio';

/**
 * C7 (corrección de la 15-L) · la escucha rechazada porque otra plataforma
 * —HikCentral— la tiene o agotó las conexiones: dicho en palabras, con la
 * acción, y la MISMA frase en la bitácora de la API que en el ensayo.
 */
describe('clasificarConexionDeEventosRechazada', () => {
  it('máximo de conexiones: 503 «Device Busy», 429, o un código que habla de enlaces', () => {
    const r = clasificarConexionDeEventosRechazada(503, RECHAZO_POR_LIMITE);
    expect(r?.clase).toBe('limite_de_conexiones');
    expect(r?.motivo).toMatch(/HTTP 503 \(deviceBusy\).*máximo de conexiones.*HikCentral/);
    expect(r?.remedio).toBe(REMEDIO_OTRA_PLATAFORMA);
    expect(r?.frase).toBe(`${r?.motivo ?? ''} → ${REMEDIO_OTRA_PLATAFORMA}`);
    expect(clasificarConexionDeEventosRechazada(429, '')?.clase).toBe('limite_de_conexiones');
    expect(
      clasificarConexionDeEventosRechazada(400, '{"statusCode":4,"subStatusCode":"maxLinkNum"}')
        ?.clase,
    ).toBe('limite_de_conexiones');
  });

  it('otra plataforma: el equipo ya está «armado» por otra', () => {
    const r = clasificarConexionDeEventosRechazada(403, RECHAZO_POR_OTRA_PLATAFORMA);
    expect(r?.clase).toBe('otra_plataforma');
    expect(r?.motivo).toMatch(/HTTP 403 \(alreadyArmed\).*otra plataforma —p\. ej\. HikCentral—/);
    expect(r?.remedio).toMatch(/deshabilite el equipo en HikCentral durante la prueba/);
  });

  it('lo demás NO es otra plataforma: éxito, credencial, ruta, contenido', () => {
    expect(clasificarConexionDeEventosRechazada(200, RECHAZO_POR_LIMITE)).toBeNull();
    expect(clasificarConexionDeEventosRechazada(401, RECHAZO_POR_LIMITE)).toBeNull();
    expect(clasificarConexionDeEventosRechazada(404, 'not found')).toBeNull();
    expect(
      clasificarConexionDeEventosRechazada(400, '{"statusCode":6,"subStatusCode":"badParameters"}'),
    ).toBeNull();
    expect(clasificarConexionDeEventosRechazada(500, '')).toBeNull();
  });
});

describe('la escucha de producción lo dice en su bitácora', () => {
  const CRED = { usuario: 'servicio', clave: 'p1' } as const;
  const escuchar = async (situaciones: SituacionesDeSitio) => {
    const lineas: { mensaje: string; contexto: Record<string, unknown> }[] = [];
    const cancelar = new AbortController();
    const escucha = new EscuchaDeAlertStream({
      host: 'terminal.ocupada.invalid',
      ...CRED,
      dispositivoId: 'disp-1',
      familia: 'terminal',
      esperar: async () => undefined,
      peticion: equipoSimulado({ familia: 'terminal', ...CRED, situaciones }),
      traza: {
        registrar: (_nivel, mensaje, contexto) => {
          lineas.push({ mensaje, contexto: { ...contexto } });
          if (mensaje === 'escucha: la conexión falló') cancelar.abort();
        },
      },
    });
    const eventos = [];
    for await (const e of escucha.escuchar(cancelar.signal)) eventos.push(e);
    return { eventos, lineas };
  };

  it('otra plataforma: la línea del rechazo lleva la frase, y el error también', async () => {
    const { eventos, lineas } = await escuchar({ escuchaRechazada: 'otra_plataforma' });
    expect(eventos).toEqual([]);
    const rechazo = lineas.find((l) => l.mensaje === 'escucha: el equipo rechazó la conexión');
    expect(rechazo?.contexto['estadoHttp']).toBe(403);
    expect(rechazo?.contexto['clase']).toBe('otra_plataforma');
    expect(String(rechazo?.contexto['motivo'])).toMatch(/HikCentral.*→ deshabilite el equipo/);
    const fallo = lineas.find((l) => l.mensaje === 'escucha: la conexión falló');
    expect(String(fallo?.contexto['error'])).toMatch(/otra plataforma/);
  });

  it('máximo de conexiones: igual, con su clase', async () => {
    const { lineas } = await escuchar({ escuchaRechazada: 'limite_de_conexiones' });
    const rechazo = lineas.find((l) => l.mensaje === 'escucha: el equipo rechazó la conexión');
    expect(rechazo?.contexto['estadoHttp']).toBe(503);
    expect(rechazo?.contexto['clase']).toBe('limite_de_conexiones');
  });
});
