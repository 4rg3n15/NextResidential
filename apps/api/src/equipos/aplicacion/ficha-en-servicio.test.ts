import { describe, expect, it } from 'vitest';
import { conDatosGuardados, hallazgoDelReceptorDeLaPlataforma } from './ficha-en-servicio';
import { SIN_PROBAR } from './puertos';

/** E4 · 7 y E5 · 10 (15-M) · el receptor comparado con la plataforma, y «dato del …». */
const esperado = { ip: '198.51.100.23', puerto: 3000 };
const propio = { host: '198.51.100.23', puerto: 3000, ruta: '/alarm-server/••••' };
const ajeno = { host: '192.0.2.140', puerto: 8080, ruta: '/eventos' };

describe('hallazgoDelReceptorDeLaPlataforma', () => {
  it('cámara que publica en esta plataforma: conforme', () => {
    const h = hallazgoDelReceptorDeLaPlataforma([propio], esperado, 'camara_lpr');
    expect(h?.estado).toBe('conforme');
    expect(h?.valorCorrecto).toBe('esta plataforma: 198.51.100.23:3000 /alarm-server/••••');
  });

  it('cámara que publica a otra dirección (el resto de sitio): bloqueo con el remedio', () => {
    const h = hallazgoDelReceptorDeLaPlataforma([ajeno], esperado, 'camara_lpr');
    expect(h?.estado).toBe('bloqueo');
    expect(h?.valorLeido).toBe('192.0.2.140:8080 /eventos');
    expect(h?.detalle).toMatch(/Enviar eventos a este Mac/);
  });

  it('cámara sin receptor: bloqueo; y sin IP del Mac no se afirma nada', () => {
    expect(hallazgoDelReceptorDeLaPlataforma([], esperado, 'camara_lpr')?.estado).toBe('bloqueo');
    const h = hallazgoDelReceptorDeLaPlataforma(
      [ajeno],
      { ip: null, motivo: 'sin interfaz en esa red', puerto: 3000 },
      'camara_lpr',
    );
    expect(h?.estado).toBe('no_comprobado');
    expect(h?.valorCorrecto).toMatch(/sin interfaz en esa red/);
  });

  it('terminal y videoportero: sólo si apunta a esta plataforma, y ofrece apagarlo', () => {
    expect(hallazgoDelReceptorDeLaPlataforma([ajeno], esperado, 'terminal_facial')).toBeNull();
    const h = hallazgoDelReceptorDeLaPlataforma([propio], esperado, 'intercom');
    expect(h?.estado).toBe('aviso');
    expect(h?.correccion).toBe('desactivar_receptor');
  });

  it('el relé no tiene receptor que juzgar', () => {
    expect(hallazgoDelReceptorDeLaPlataforma([propio], esperado, 'rele')).toBeNull();
  });
});

describe('conDatosGuardados · «dato del DD-MM-YYYY»', () => {
  const guardado = {
    modelo: 'DS-1',
    firmware: 'V5.7',
    identidadLeidaEn: '2026-09-20T10:00:00.000Z',
  };

  it('si el sondeo leyó el modelo, es de hoy: sin fecha', () => {
    const r = conDatosGuardados(
      { ...SIN_PROBAR, clase: 'alcanzado', modelo: 'DS-2', firmware: 'V6' },
      guardado,
    );
    expect(r.modelo).toBe('DS-2');
    expect(r.identidadDel).toBeNull();
  });

  it('si el sondeo falló, enseña lo guardado con la fecha en que se leyó', () => {
    const r = conDatosGuardados({ ...SIN_PROBAR, clase: 'inalcanzable' }, guardado);
    expect(r.modelo).toBe('DS-1');
    expect(r.firmware).toBe('V5.7');
    expect(r.identidadDel).toBe('2026-09-20T10:00:00.000Z');
  });

  it('sin nada guardado no hay fecha que inventar', () => {
    const r = conDatosGuardados(SIN_PROBAR, {
      modelo: null,
      firmware: null,
      identidadLeidaEn: null,
    });
    expect(r.modelo).toBeNull();
    expect(r.identidadDel).toBeNull();
  });
});
