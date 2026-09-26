import { describe, expect, it } from 'vitest';
import {
  contiene,
  cruzaMedianoche,
  duracionSegundos,
  esDia,
  esHora,
  franjaDe,
  seSolapan,
} from './turno';
import {
  MAXIMO_DE_INTENTOS,
  alCerrar,
  alDesbloquear,
  alIniciarPatrullaje,
  intentosAgotados,
} from './sesion-de-porteria';
import type { SesionDePorteria } from './sesion-de-porteria';

const BOGOTA = 'America/Bogota';

describe('franja del turno en la zona de la copropiedad', () => {
  it('un turno diurno queda en el mismo día, en UTC−5', () => {
    const f = franjaDe('2026-09-25', '06:00', '14:00', BOGOTA);
    expect(f.inicio.toISOString()).toBe('2026-09-25T11:00:00.000Z');
    expect(f.fin.toISOString()).toBe('2026-09-25T19:00:00.000Z');
  });

  it('un turno que cruza la medianoche termina al día siguiente', () => {
    expect(cruzaMedianoche('22:00', '06:00')).toBe(true);
    const f = franjaDe('2026-09-25', '22:00', '06:00', BOGOTA);
    expect(f.inicio.toISOString()).toBe('2026-09-26T03:00:00.000Z');
    expect(f.fin.toISOString()).toBe('2026-09-26T11:00:00.000Z');
  });

  it('un turno de 24 h (misma hora) cruza también', () => {
    expect(cruzaMedianoche('07:00', '07:00')).toBe(true);
  });

  it('respeta el cambio de horario de una zona con verano', () => {
    // Madrid pasa a UTC+1 el 25/10/2026 a las 03:00 locales.
    const f = franjaDe('2026-10-24', '22:00', '06:00', 'Europe/Madrid');
    expect(f.inicio.toISOString()).toBe('2026-10-24T20:00:00.000Z');
    expect(f.fin.toISOString()).toBe('2026-10-25T05:00:00.000Z');
  });

  it('franja semiabierta: a la hora de inicio sí, a la de fin ya no', () => {
    const f = franjaDe('2026-09-25', '22:00', '06:00', BOGOTA);
    expect(contiene(f, new Date('2026-09-26T02:59:59.999Z'))).toBe(false);
    expect(contiene(f, new Date('2026-09-26T03:00:00.000Z'))).toBe(true);
    expect(contiene(f, new Date('2026-09-26T07:00:00.000Z'))).toBe(true);
    expect(contiene(f, new Date('2026-09-26T10:59:59.999Z'))).toBe(true);
    expect(contiene(f, new Date('2026-09-26T11:00:00.000Z'))).toBe(false);
  });

  it('detecta solapes y no confunde turnos contiguos', () => {
    const noche = franjaDe('2026-09-25', '22:00', '06:00', BOGOTA);
    const manana = franjaDe('2026-09-26', '06:00', '14:00', BOGOTA);
    const madrugada = franjaDe('2026-09-26', '04:00', '08:00', BOGOTA);
    expect(seSolapan(noche, manana)).toBe(false);
    expect(seSolapan(noche, madrugada)).toBe(true);
  });

  it('valida día y hora', () => {
    expect(esDia('2026-02-29')).toBe(false);
    expect(esDia('2028-02-29')).toBe(true);
    expect(esHora('24:00')).toBe(false);
    expect(esHora('23:59')).toBe(true);
  });

  it('la duración nunca es negativa', () => {
    expect(duracionSegundos(new Date(10_000), new Date(4_000))).toBe(0);
    expect(duracionSegundos(new Date(0), new Date(90_000))).toBe(90);
  });
});

const sesion = (estado: SesionDePorteria['estado']): SesionDePorteria => ({
  sesionId: 's',
  copropiedadId: 'c',
  porteroId: 'p',
  turnoId: 't',
  estado,
  codigoHash: 'h',
  intentosFallidos: 0,
  iniciadaEn: new Date(0),
  patrullajeDesde: null,
  cerradaEn: null,
  motivoCierre: null,
  origenDeclarado: null,
});

describe('máquina de estados de la sesión', () => {
  it('sólo una sesión activa entra en patrullaje', () => {
    const ahora = new Date(1000);
    expect(alIniciarPatrullaje(sesion('activa'), ahora)).toEqual({
      estado: 'patrullaje',
      patrullajeDesde: ahora,
      intentosFallidos: 0,
    });
    expect(alIniciarPatrullaje(sesion('patrullaje'), ahora)).toBeNull();
    expect(alIniciarPatrullaje(sesion('cerrada'), ahora)).toBeNull();
  });

  it('desbloquear vuelve a activa y reinicia los intentos', () => {
    expect(alDesbloquear()).toEqual({
      estado: 'activa',
      patrullajeDesde: null,
      intentosFallidos: 0,
    });
  });

  it('cerrar deja constancia del motivo y del instante', () => {
    const ahora = new Date(5000);
    expect(alCerrar('intentos_agotados', ahora)).toMatchObject({
      estado: 'cerrada',
      cerradaEn: ahora,
      motivoCierre: 'intentos_agotados',
    });
  });

  it('el quinto intento fallido agota', () => {
    expect(MAXIMO_DE_INTENTOS).toBe(5);
    expect(intentosAgotados(4)).toBe(false);
    expect(intentosAgotados(5)).toBe(true);
  });
});
