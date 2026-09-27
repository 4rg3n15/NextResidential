import { describe, expect, it } from 'vitest';
import { SENAL_RECIENTE_MS, hallazgoDeEventos } from './senal-de-eventos';

/** C3 (15-L) · eventos en la ficha: la señal real de la escucha, con su edad. */
const AHORA = new Date('2026-09-27T15:00:00Z');
const hace = (ms: number): Date => new Date(AHORA.getTime() - ms);

describe('hallazgoDeEventos', () => {
  it('sin escucha: no comprobado, y dice por qué y cuándo se abre', () => {
    expect(hallazgoDeEventos(null, AHORA)).toMatchObject({
      estado: 'no_comprobado',
      valorLeido: null,
      detalle: expect.stringMatching(/menos de 30 s/),
    });
  });

  it('escucha abierta sin nada todavía: aviso con qué hacer', () => {
    expect(hallazgoDeEventos({ transporte: 'escucha', ultimaSenal: null }, AHORA)).toMatchObject({
      estado: 'aviso',
      valorLeido: 'flujo de alertas abierto · sin señal todavía',
    });
  });

  it('con señal reciente: conforme, con los segundos', () => {
    expect(
      hallazgoDeEventos({ transporte: 'suscripcion', ultimaSenal: hace(12_000) }, AHORA),
    ).toMatchObject({ estado: 'conforme', valorLeido: 'suscripción · última señal hace 12 s' });
  });

  it('con señal vieja: aviso', () => {
    expect(
      hallazgoDeEventos(
        { transporte: 'escucha', ultimaSenal: hace(SENAL_RECIENTE_MS + 1000) },
        AHORA,
      ).estado,
    ).toBe('aviso');
  });

  it('C7 · rechazada por otra plataforma: BLOQUEO, con la frase y el remedio de HikCentral', () => {
    const rechazo =
      'el equipo rechazó la conexión de eventos (HTTP 403 (alreadyArmed)) porque otra ' +
      'plataforma —p. ej. HikCentral— ya la tiene → deshabilite el equipo en HikCentral ' +
      'durante la prueba (o quítele la suscripción de eventos) y vuelva a conectar';
    const h = hallazgoDeEventos(
      { transporte: 'suscripcion', ultimaSenal: hace(5_000), rechazo },
      AHORA,
    );
    // Aunque haya una señal vieja reciente: el rechazo vigente manda.
    expect(h).toMatchObject({
      estado: 'bloqueo',
      valorLeido: 'suscripción rechazado por el equipo',
    });
    expect(h.detalle).toMatch(/^El equipo rechazó/);
    expect(h.detalle).toMatch(/deshabilite el equipo en HikCentral durante la prueba/);
  });

  it('C7 · sin rechazo vigente (`null`), el hallazgo es el de siempre', () => {
    expect(
      hallazgoDeEventos({ transporte: 'escucha', ultimaSenal: hace(1_000), rechazo: null }, AHORA)
        .estado,
    ).toBe('conforme');
  });
});
