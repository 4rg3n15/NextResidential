import { describe, expect, it } from 'vitest';
import type { DiagnosticoDeEquipo } from '../diagnostico/diagnostico-de-equipo';
import type { FichaDelEquipo, HallazgoDelEquipo } from '../diagnostico/ficha';
import { pasoDeConexion, pasoDeConfiguracion, pasoDeHora, pasoDeVideo } from './pasos-de-lectura';

/**
 * J1 · los pasos que sólo LEEN son funciones puras sobre el diagnóstico: cada
 * rama —cada causa distinta que puede encontrarse en sitio— con su acción.
 */
const AHORA = new Date('2026-09-27T14:00:00Z');
const BASE: DiagnosticoDeEquipo = {
  familia: 'terminal',
  contacto: { clase: 'alcanzado', detalle: '', latenciaMs: 12.4 },
  modelo: 'DS-K1T344MBFWX-E',
  firmware: 'V4.47.0',
  serie: null,
  control: null,
  disparador: null,
  pais: null,
  receptor: null,
  capacidades: null,
  reportaEstadoDeBarrera: null,
  capacidadesDelEquipo: null,
  hora: { leida: '2026-09-27T09:00:00-05:00', desvioSegundos: 3, excesiva: false, detalle: '' },
  sinRespuesta: [],
};
const hora = (zona: string, local = '2026-09-27T09:00:00-05:00') =>
  `<Time><localTime>${local}</localTime><timeZone>${zona}</timeZone></Time>`;

describe('paso 1 · conexión', () => {
  it('sin equipo, credencial y alcanzado: tres causas, tres acciones', () => {
    const sin = pasoDeConexion(
      { ...BASE, contacto: { clase: 'sin_equipo', detalle: '', latenciaMs: null } },
      'camara',
    );
    expect(sin.accion).toMatch(/BARRERA_HOST y BARRERA_PUERTO/);
    const clave = pasoDeConexion(
      { ...BASE, contacto: { clase: 'credencial', detalle: '', latenciaMs: null } },
      'videoportero',
    );
    expect(clave.accion).toMatch(/NO repita.*VIDEOPORTERO_USUARIO/);
    expect(pasoDeConexion(BASE, 'terminal').causa).toBe(
      'Digest aceptado · DS-K1T344MBFWX-E · V4.47.0 · 12 ms',
    );
    expect(
      pasoDeConexion(
        { ...BASE, modelo: null, firmware: null, contacto: { ...BASE.contacto, latenciaMs: null } },
        'terminal',
      ).causa,
    ).toBe('Digest aceptado');
  });
});

describe('paso 2 · hora y zona', () => {
  it('sin hora, zona mala, desvío excesivo, desvío ilegible, zona ilegible y bien', () => {
    expect(pasoDeHora({ ...BASE, hora: null }, null, 'America/Bogota', AHORA).estado).toBe('fallo');
    expect(pasoDeHora(BASE, hora('CST+0:00:00', 'x'), 'America/Bogota', AHORA).causa).toMatch(
      /Zona horaria equivocada/,
    );
    const excesiva = { ...BASE, hora: { ...BASE.hora!, excesiva: true, detalle: 'va 300 s' } };
    expect(pasoDeHora(excesiva, hora('CST+5:00:00'), 'America/Bogota', AHORA).causa).toBe(
      'va 300 s',
    );
    const ilegible = {
      ...BASE,
      hora: { ...BASE.hora!, desvioSegundos: null, detalle: 'ilegible' },
    };
    expect(pasoDeHora(ilegible, hora('CST+5:00:00'), 'America/Bogota', AHORA).causa).toBe(
      'ilegible',
    );
    const sinZona = pasoDeHora(
      BASE,
      '<Time><localTime>x</localTime></Time>',
      'America/Bogota',
      AHORA,
    );
    expect(sinZona.estado).toBe('fallo');
    expect(sinZona.causa).toMatch(/Hora bien \(3 s\), pero/);
    expect(pasoDeHora(BASE, hora('CST+5:00:00'), 'America/Bogota', AHORA).estado).toBe('ok');
  });
});

describe('paso 3 · configuración', () => {
  const h = (estado: HallazgoDelEquipo['estado'], campo: string): HallazgoDelEquipo => ({
    campo,
    estado,
    valorLeido: estado === 'no_comprobado' ? null : 'v',
    valorCorrecto: null,
    detalle: `detalle de ${campo}`,
    correccion: null,
  });
  const ficha = (hallazgos: HallazgoDelEquipo[]): FichaDelEquipo => ({
    modelo: null,
    firmware: null,
    serie: null,
    horaDelEquipo: null,
    desvioDeRelojSegundos: null,
    hallazgos,
    sinComprobar: ['algo: no contestó'],
  });
  const vacio = { fallos: [], notas: [] };

  it('un bloqueo o un fallo de capacidades suspende; un aviso sólo se anota', () => {
    const bloqueo = pasoDeConfiguracion(ficha([h('bloqueo', 'quién decide')]), vacio);
    expect(bloqueo.estado).toBe('fallo');
    expect(bloqueo.causa).toBe('quién decide: detalle de quién decide');
    const extra = pasoDeConfiguracion(ficha([]), { fallos: ['sin setUp'], notas: ['nota'] });
    expect(extra.causa).toBe('sin setUp');
    expect(extra.detalle).toContain('nota');
    const aviso = pasoDeConfiguracion(
      ficha([h('aviso', 'reloj'), h('conforme', 'x'), h('no_comprobado', 'y')]),
      vacio,
    );
    expect(aviso.estado).toBe('ok');
    expect(aviso.causa).toMatch(/1 aviso/);
    expect(aviso.detalle).toEqual([
      '⚠ reloj: v — detalle de reloj',
      '✓ x: v',
      '· y: sin leer — detalle de y',
      '· sin respuesta: algo: no contestó',
    ]);
    expect(pasoDeConfiguracion(ficha([h('conforme', 'x')]), vacio).causa).toMatch(
      /la que la plataforma/,
    );
  });
});

describe('paso 7 · video', () => {
  const video = (v: Partial<NonNullable<DiagnosticoDeEquipo['video']>>): DiagnosticoDeEquipo => ({
    ...BASE,
    video: {
      clase: 'respondio',
      estado: 200,
      codec: 'H.264',
      detalle: 'd',
      canal: '102',
      puerto: 554,
      ...v,
    },
  });
  it('cada respuesta RTSP con su acción; sólo H.264 es OK', () => {
    expect(pasoDeVideo(BASE, 'camara').estado).toBe('no_aplica');
    expect(pasoDeVideo(video({ clase: 'credencial' }), 'camara').accion).toMatch(
      /Vista en directo/,
    );
    expect(pasoDeVideo(video({ clase: 'inalcanzable' }), 'camara').accion).toMatch(
      /VIDEO_PUERTO_RTSP/,
    );
    expect(pasoDeVideo(video({ clase: 'rechazo', estado: 404 }), 'terminal').accion).toMatch(
      /TERMINAL_CANAL_VIDEO/,
    );
    expect(pasoDeVideo(video({ codec: null }), 'camara').causa).toMatch(/que no se pudo leer/);
    expect(pasoDeVideo(video({}), 'camara').causa).toBe(
      'H.264 por RTSP (canal 102, puerto RTSP 554)',
    );
  });
});
