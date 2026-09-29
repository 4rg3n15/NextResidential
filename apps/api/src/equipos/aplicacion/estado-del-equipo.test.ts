import { describe, expect, it } from 'vitest';
import { aEstadoSalud, estadoDelEquipo } from './estado-del-equipo';
import type { EntradasDeEstado } from './estado-del-equipo';

const AHORA = new Date('2026-09-29T10:00:00Z');
const hace = (segundos: number): Date => new Date(AHORA.getTime() - segundos * 1000);

const nada: EntradasDeEstado = {
  ultimoSondeo: null,
  credencialRechazadaEn: null,
  escucha: null,
  ultimoEvento: null,
  ultimoLatido: null,
};

describe('estadoDelEquipo · una sola fuente de verdad (E5)', () => {
  it('sin ninguna señal jamás es «sin comprobar», no «caído»', () => {
    const e = estadoDelEquipo(nada, AHORA);
    expect(e.enLinea).toBe('sin_comprobar');
    expect(e.alcanzable).toBeNull();
    expect(e.autenticacion).toBe('sin_comprobar');
    expect(e.motivo).toMatch(/Nadie lo ha sondeado/);
  });

  it('el videoportero cuya escucha entrega eventos está EN LÍNEA aunque no tenga latido', () => {
    const e = estadoDelEquipo(
      { ...nada, escucha: { transporte: 'escucha', ultimaSenal: hace(20) } },
      AHORA,
    );
    expect(e.enLinea).toBe('en_linea');
    expect(e.escucha).toBe('abierta');
    expect(e.motivo).toMatch(/su escucha/);
  });

  it('la terminal que rechazó la clave sale DEGRADADA aunque tenga latido reciente', () => {
    const e = estadoDelEquipo(
      {
        ...nada,
        ultimoLatido: hace(30),
        ultimoSondeo: { clase: 'credencial', en: hace(120) },
        credencialRechazadaEn: hace(120),
      },
      AHORA,
    );
    expect(e.enLinea).toBe('degradado');
    expect(e.autenticacion).toBe('rechazada');
    expect(e.autenticacionRechazadaHaceMin).toBe(2);
    expect(e.motivo).toMatch(/rechazó el usuario o la clave hace 2 min/);
  });

  it('un rechazo de credencial ANTERIOR a una señal viva ya no cuenta', () => {
    const e = estadoDelEquipo(
      {
        ...nada,
        credencialRechazadaEn: hace(3600),
        ultimoSondeo: { clase: 'alcanzado', en: hace(40) },
      },
      AHORA,
    );
    expect(e.enLinea).toBe('en_linea');
    expect(e.autenticacion).toBe('aceptada');
  });

  it('el equipo inalcanzable en el sondeo y sin señal desde entonces es «sin comprobar» o fuera de línea', () => {
    const sinSenal = estadoDelEquipo(
      { ...nada, ultimoSondeo: { clase: 'inalcanzable', en: hace(10) } },
      AHORA,
    );
    expect(sinSenal.enLinea).toBe('sin_comprobar');
    expect(sinSenal.alcanzable).toBe(false);
    const conLatidoViejo = estadoDelEquipo(
      { ...nada, ultimoLatido: hace(900), ultimoSondeo: { clase: 'inalcanzable', en: hace(10) } },
      AHORA,
    );
    expect(conLatidoViejo.enLinea).toBe('fuera_de_linea');
    expect(conLatidoViejo.alcanzable).toBe(false);
  });

  it('la escucha rechazada por otra plataforma degrada y explica quién la tiene', () => {
    const e = estadoDelEquipo(
      {
        ...nada,
        ultimoLatido: hace(10),
        escucha: {
          transporte: 'escucha',
          ultimaSenal: null,
          rechazo: 'otra plataforma tiene la conexión. Cierre HikCentral',
        },
      },
      AHORA,
    );
    expect(e.enLinea).toBe('degradado');
    expect(e.escucha).toBe('rechazada');
    expect(e.motivo).toMatch(/otra plataforma tiene la conexión/);
  });

  it('el umbral de la copropiedad manda: 61 s con un latido perdido tolerado es en línea; 130 s degradado; 300 s caído', () => {
    const umbral = { periodoSegundos: 60, latidosTolerados: 1, silencioParaCaidoSegundos: 300 };
    expect(estadoDelEquipo({ ...nada, ultimoLatido: hace(61), umbral }, AHORA).enLinea).toBe(
      'en_linea',
    );
    expect(estadoDelEquipo({ ...nada, ultimoLatido: hace(130), umbral }, AHORA).enLinea).toBe(
      'degradado',
    );
    expect(estadoDelEquipo({ ...nada, ultimoLatido: hace(300), umbral }, AHORA).enLinea).toBe(
      'fuera_de_linea',
    );
  });

  it('la señal más reciente de todas decide, y se dice cuál fue', () => {
    const e = estadoDelEquipo({ ...nada, ultimoLatido: hace(200), ultimoEvento: hace(5) }, AHORA);
    expect(e.enLinea).toBe('en_linea');
    expect(e.ultimaSenal).toEqual(hace(5));
    expect(e.motivo).toMatch(/un evento/);
  });

  it('se traduce al enumerado de la base sin inventar un cuarto valor', () => {
    expect(aEstadoSalud('en_linea')).toBe('saludable');
    expect(aEstadoSalud('degradado')).toBe('degradado');
    expect(aEstadoSalud('fuera_de_linea')).toBe('caido');
    expect(aEstadoSalud('sin_comprobar')).toBe('caido');
  });
});
