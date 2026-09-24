import { describe, expect, it } from 'vitest';
import { diagnosticarEquipo } from './diagnostico-de-equipo';
import type { FamiliaDiagnosticada } from './diagnostico-de-equipo';
import { fichaDe } from './ficha';
import { equiposSimulados } from '../simulacion/equipo-simulado';

/**
 * O4 · la ficha es POLIMÓRFICA: una terminal y un videoportero tienen sus
 * propios veredictos, salidos de las capacidades neutrales (O2), y NINGUNO de
 * los de la cámara. Todo contra el simulador: PROBADO CONTRA MOCK, no contra
 * hardware.
 */
const HOST = '203.0.113.41';
const CREDENCIAL = { usuario: 'servicio', clave: 'clave-de-prueba' } as const;

const diagnosticar = async (familia: FamiliaDiagnosticada, guion: Record<string, unknown> = {}) =>
  diagnosticarEquipo({
    host: HOST,
    puerto: 80,
    protocolo: 'http',
    ...CREDENCIAL,
    familia,
    peticion: equiposSimulados({ [HOST]: { familia, ...CREDENCIAL, ...guion } }),
    ahoraDelServidor: () => new Date(0),
  });

const campos = (hallazgos: readonly { campo: string }[]): string[] => hallazgos.map((h) => h.campo);
const estadoDe = (
  hallazgos: readonly { campo: string; estado: string }[],
  campo: RegExp,
): string | undefined => hallazgos.find((h) => campo.test(h.campo))?.estado;

describe('terminal facial · veredictos propios, no los de una cámara', () => {
  it('declara familia y capacidades neutrales en la misma ronda', async () => {
    const d = await diagnosticar('terminal', { verificacionRemota: true });
    expect(d.familia).toBe('terminal');
    expect(d.capacidadesDelEquipo?.origen).toBe('descubiertas');
    expect(d.capacidadesDelEquipo?.verificacionRemota).toBe('si');
    // Lo de la cámara no se pregunta ni se inventa.
    expect(d.control).toBeNull();
    expect(d.pais).toBeNull();
    expect(d.receptor).toBeNull();
  });

  it('la ficha NO trae país, receptor ni disparadores: son de cámara', async () => {
    const ficha = fichaDe(await diagnosticar('terminal', { verificacionRemota: true }));
    const nombres = campos(ficha.hallazgos);
    expect(nombres.some((c) => /país|receptor|disparador|matrícula/.test(c))).toBe(false);
    expect(nombres).toContain('quién decide la apertura');
    expect(nombres).toContain('biblioteca de rostros');
    expect(nombres).toContain('apertura desde la plataforma');
    expect(nombres).toContain('reloj del equipo');
  });

  it('con verificación remota REPORTA Y ESPERA: conforme; sin ella, BLOQUEO', async () => {
    const espera = fichaDe(await diagnosticar('terminal', { verificacionRemota: true }));
    expect(estadoDe(espera.hallazgos, /quién decide/)).toBe('conforme');
    const sola = fichaDe(await diagnosticar('terminal', { verificacionRemota: false }));
    expect(estadoDe(sola.hallazgos, /quién decide/)).toBe('bloqueo');
    expect(sola.hallazgos.find((h) => /quién decide/.test(h.campo))?.detalle).toMatch(
      /decide por su cuenta/,
    );
  });

  it('una biblioteca al 90 % avisa antes de que la sincronización falle', async () => {
    const llena = fichaDe(
      await diagnosticar('terminal', {
        verificacionRemota: true,
        bibliotecaMaximo: 100,
        bibliotecaAlmacenadas: 95,
      }),
    );
    const hallazgo = llena.hallazgos.find((h) => h.campo === 'biblioteca de rostros');
    expect(hallazgo?.estado).toBe('aviso');
    expect(hallazgo?.valorLeido).toBe('95 de 100 plantillas');
  });

  it('un equipo que no declara nada queda SIN COMPROBAR, nunca conforme', async () => {
    const ficha = fichaDe(await diagnosticar('terminal', { sinCapacidades: true }));
    expect(
      ficha.hallazgos
        .filter((h) => h.campo !== 'reloj del equipo')
        .every((h) => h.estado === 'no_comprobado'),
    ).toBe(true);
  });
});

describe('videoportero · apertura, audio, llamada y suscripción', () => {
  it('con todo declarado, los cuatro son conformes y el canal se nombra', async () => {
    const ficha = fichaDe(
      await diagnosticar('videoportero', {
        aperturaRemota: true,
        senalizaLlamadas: true,
        admiteSuscripcion: true,
        canalesDeAudio: [{ id: 1, habilitado: true, codec: 'G.711ulaw' }],
      }),
    );
    expect(estadoDe(ficha.hallazgos, /apertura desde la plataforma/)).toBe('conforme');
    expect(estadoDe(ficha.hallazgos, /canal de audio/)).toBe('conforme');
    expect(ficha.hallazgos.find((h) => /canal de audio/.test(h.campo))?.valorLeido).toMatch(
      /canal 1/,
    );
    expect(estadoDe(ficha.hallazgos, /señalización/)).toBe('conforme');
    expect(estadoDe(ficha.hallazgos, /suscripción/)).toBe('conforme');
    expect(campos(ficha.hallazgos).some((c) => /país|matrícula|quién decide/.test(c))).toBe(false);
  });

  it('sin apertura remota es BLOQUEO (KPI-32 imposible); sin audio es AVISO (contingencia ADR-01)', async () => {
    const ficha = fichaDe(
      await diagnosticar('videoportero', {
        aperturaRemota: false,
        canalesDeAudio: [{ id: 1, habilitado: false }],
      }),
    );
    expect(estadoDe(ficha.hallazgos, /apertura desde la plataforma/)).toBe('bloqueo');
    expect(estadoDe(ficha.hallazgos, /canal de audio/)).toBe('aviso');
  });
});

describe('la cámara conserva sus seis secciones', () => {
  it('y ahora también lleva las capacidades neutrales', async () => {
    const d = await diagnosticar('camara');
    expect(d.familia).toBe('camara');
    expect(d.capacidadesDelEquipo?.reconocimientoDePlacas).toBeDefined();
    const nombres = campos(fichaDe(d).hallazgos);
    expect(nombres).toContain('país del algoritmo');
    expect(nombres).toContain('disparadores vinculados');
  });
});
