import { describe, expect, it } from 'vitest';
import { fichaDe } from './ficha';
import type { DiagnosticoDeEquipo } from './diagnostico-de-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL APLANADO, PROBADO SOBRE DIAGNÓSTICOS ARMADOS A MANO
 *
 * Aquí no hay equipo ni simulado: se construye el veredicto exacto que se quiere
 * ver aplanado. Es la única forma de recorrer los estados raros —el equipo que
 * contesta seis cosas y falla en la séptima— sin fabricar siete escenarios de
 * red para llegar a cada uno.
 *
 * Lo que se fija: que **nada que no se comprobara acabe pintado como conforme**.
 */

const VACIO: DiagnosticoDeEquipo = {
  contacto: { clase: 'alcanzado', detalle: 'responde', latenciaMs: 10 },
  modelo: null,
  firmware: null,
  serie: null,
  control: null,
  disparador: null,
  pais: null,
  receptor: null,
  capacidades: null,
  reportaEstadoDeBarrera: null,
  hora: null,
  sinRespuesta: [],
};

const con = (parcial: Partial<DiagnosticoDeEquipo>): DiagnosticoDeEquipo => ({
  ...VACIO,
  ...parcial,
});

describe('lo que no se pudo leer sale como SIN COMPROBAR, nunca como conforme', () => {
  it('y son todas las secciones, no unas cuantas', () => {
    const ficha = fichaDe(VACIO);
    expect(ficha.hallazgos.length).toBeGreaterThanOrEqual(5);
    expect(ficha.hallazgos.every((h) => h.estado === 'no_comprobado')).toBe(true);
  });

  it('el de «quién decide» lo dice con esas palabras: no se opera sobre una suposición', () => {
    const hallazgo = fichaDe(VACIO).hallazgos.find((h) => /quién decide/.test(h.campo));
    expect(hallazgo?.detalle).toMatch(/suposición/i);
  });

  it('el del disparador dice que no se puede DESCARTAR que abra solo', () => {
    const hallazgo = fichaDe(VACIO).hallazgos.find((h) => /disparadores/.test(h.campo));
    expect(hallazgo?.detalle).toMatch(/no se puede descartar/i);
  });
});

describe('los avisos del comportamiento del brazo', () => {
  it('salen como aviso y NO traen botón: se cambian en el aparato', () => {
    const ficha = fichaDe(
      con({
        control: {
          admisible: true,
          leido: true,
          detalle: 'ok',
          modo: { admisible: true, modo: 'plataforma', valorLeido: '1', detalle: 'ok' },
          reglasInternas: [],
          reles: [],
          releQueAbre: null,
          bloqueos: [],
          avisos: [
            {
              campo: 'no cerrar con vehículos pegados',
              valorLeido: 'true',
              detalle: 'pasan varios con una sola decisión',
              valorCorrecto: 'false',
            },
          ],
        },
      }),
    );
    const aviso = ficha.hallazgos.find((h) => /brazo/.test(h.campo));
    expect(aviso?.estado).toBe('aviso');
    expect(aviso?.correccion).toBeNull();
  });
});

describe('las capacidades y el estado del brazo', () => {
  it('un equipo que NO declara reconocer matrículas es un bloqueo', () => {
    const ficha = fichaDe(
      con({
        capacidades: {
          admite: false,
          senales: [],
          sinRespuesta: [],
          detalle: 'ninguna señal lo confirma',
        },
      }),
    );
    const hallazgo = ficha.hallazgos.find((h) => /matrícula/.test(h.campo));
    expect(hallazgo?.estado).toBe('bloqueo');
  });

  it('y uno que sí, es conforme', () => {
    const ficha = fichaDe(
      con({
        capacidades: {
          admite: true,
          senales: [{ fuente: 'trafico', campo: 'plateCap', valor: 'declarado' }],
          sinRespuesta: [],
          detalle: 'lo declara',
        },
      }),
    );
    expect(ficha.hallazgos.find((h) => /matrícula/.test(h.campo))?.estado).toBe('conforme');
  });

  it('un modelo que NO reporta el estado del brazo se avisa, para no sondearlo a ciegas', () => {
    // Sondearlo mostraría un estado desconocido permanente que parece avería.
    const ficha = fichaDe(con({ reportaEstadoDeBarrera: false }));
    const hallazgo = ficha.hallazgos.find((h) => /estado de la barrera/.test(h.campo));
    expect(hallazgo?.estado).toBe('aviso');
  });

  it('y uno que sí lo reporta no genera hallazgo', () => {
    const ficha = fichaDe(con({ reportaEstadoDeBarrera: true }));
    expect(ficha.hallazgos.some((h) => /estado de la barrera/.test(h.campo))).toBe(false);
  });
});

describe('el receptor', () => {
  it('sin ninguno configurado se avisa: el equipo no publicará en ninguna parte', () => {
    const ficha = fichaDe(
      con({
        receptor: {
          leido: true,
          receptores: [],
          bloqueos: [],
          avisos: [],
          enviaRostros: false,
          detalle: 'el equipo no tiene ningún receptor configurado',
        },
      }),
    );
    expect(ficha.hallazgos.find((h) => /publica/.test(h.campo))?.estado).toBe('aviso');
  });

  it('un formato equivocado trae su botón de corrección', () => {
    const ficha = fichaDe(
      con({
        receptor: {
          leido: true,
          receptores: [],
          bloqueos: [
            {
              campo: 'receptor 1 · formato de notificación',
              valorLeido: 'JSON',
              detalle: 'el sobre llegaría ilegible',
              valorCorrecto: 'XML',
            },
          ],
          avisos: [],
          enviaRostros: false,
          detalle: '1 bloqueo',
        },
      }),
    );
    expect(ficha.hallazgos.find((h) => /formato/.test(h.campo))?.correccion).toBe(
      'formato_del_receptor',
    );
  });
});

describe('el reloj y lo que no contestó', () => {
  it('un reloj dentro de tolerancia es conforme', () => {
    const ficha = fichaDe(
      con({
        hora: { leida: '2026-09-23T12:00:00Z', desvioSegundos: 1, excesiva: false, detalle: 'ok' },
      }),
    );
    expect(ficha.hallazgos.find((h) => /reloj/.test(h.campo))?.estado).toBe('conforme');
    expect(ficha.desvioDeRelojSegundos).toBe(1);
  });

  it('uno desviado es aviso', () => {
    const ficha = fichaDe(
      con({
        hora: {
          leida: '2026-09-23T17:00:00Z',
          desvioSegundos: 18000,
          excesiva: true,
          detalle: 'va adelantado',
        },
      }),
    );
    expect(ficha.hallazgos.find((h) => /reloj/.test(h.campo))?.estado).toBe('aviso');
  });

  it('una hora ilegible no es conforme: queda sin comprobar', () => {
    const ficha = fichaDe(
      con({ hora: { leida: 'ayer', desvioSegundos: null, excesiva: false, detalle: 'ilegible' } }),
    );
    expect(ficha.hallazgos.find((h) => /reloj/.test(h.campo))?.estado).toBe('no_comprobado');
  });

  it('las consultas sin respuesta se ENSEÑAN, con su motivo', () => {
    const ficha = fichaDe(
      con({ sinRespuesta: [{ que: 'leer la hora del equipo', motivo: 'no lo admite' }] }),
    );
    expect(ficha.sinComprobar[0]).toContain('no lo admite');
  });
});
