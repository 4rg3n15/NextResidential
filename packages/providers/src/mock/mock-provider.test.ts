import { describe, expect, it } from 'vitest';
import type {
  AccessPointProvider,
  FaceTemplateProvider,
  IntercomProvider,
  LecturaDePlaca,
  PlateEventSource,
} from '@ncr/domain-core';
import { MockProvider } from './mock-provider';
import {
  Azar,
  FalloDeHardwareSimulado,
  PERFIL_IDEAL,
  PERFIL_REALISTA,
  RelojSimulado,
} from './simulacion';

const ideal = (extra = {}): MockProvider =>
  new MockProvider({ perfil: PERFIL_IDEAL, semilla: 1, ...extra });

describe('Azar · determinismo', () => {
  it('la misma semilla produce la misma secuencia: un fallo se reproduce', () => {
    const a = new Azar(42);
    const b = new Azar(42);
    const serie = (r: Azar): number[] => [r.siguiente(), r.siguiente(), r.siguiente()];
    expect(serie(a)).toEqual(serie(b));
  });

  it('una probabilidad intermedia decide por la secuencia, no por el azar del sistema', () => {
    const r = new Azar(123);
    const tirada = [r.ocurre(0.5), r.ocurre(0.5), r.ocurre(0.5)];
    expect(new Azar(123).ocurre(0.5)).toBe(tirada[0]);
    expect(tirada.every((v) => typeof v === 'boolean')).toBe(true);
  });

  it('semilla 0 no atasca el generador en cero', () => {
    const r = new Azar(0);
    expect(r.siguiente()).toBeGreaterThan(0);
  });

  it('probabilidades degeneradas no consumen azar', () => {
    const r = new Azar(7);
    expect(r.ocurre(0)).toBe(false);
    expect(r.ocurre(-1)).toBe(false);
    expect(r.ocurre(1)).toBe(true);
    expect(r.ocurre(2)).toBe(true);
    expect(r.entre(5, 5)).toBe(5);
  });
});

describe('RelojSimulado · el tiempo es virtual', () => {
  it('no bloquea: avanza sumando', () => {
    const reloj = new RelojSimulado(new Date('2026-09-08T14:00:00Z'));
    reloj.avanzar(1500);
    expect(reloj.ahora().toISOString()).toBe('2026-09-08T14:00:01.500Z');
  });
});

describe('MockProvider · LSP (§2.3, KPI-12)', () => {
  it('satisface los cuatro puertos con la misma instancia', () => {
    const mock = ideal();
    const punto: AccessPointProvider = mock;
    const placas: PlateEventSource = mock;
    const rostros: FaceTemplateProvider = mock;
    const intercom: IntercomProvider = mock;
    expect([punto, placas, rostros, intercom].every((p) => p === mock)).toBe(true);
  });
});

describe('MockProvider · construcción', () => {
  it('sin opciones usa el perfil realista y su propio reloj simulado', () => {
    const mock = new MockProvider();
    expect(mock.reloj.ahora().toISOString()).toBe('2026-09-08T14:00:00.000Z');
  });

  it('admite un inventario y un reloj propios', async () => {
    const reloj = new RelojSimulado(new Date('2026-01-01T00:00:00Z'));
    const mock = new MockProvider({ perfil: PERFIL_IDEAL, reloj, dispositivos: ['disp-unico'] });
    expect(await mock.estado('disp-unico')).toBe('en_linea');
    expect(await mock.estado('disp-porteria')).toBe('fuera_de_linea');
    expect(mock.reloj.ahora().getUTCFullYear()).toBe(2026);
  });
});

describe('MockProvider · accionamiento', () => {
  it('abre y deja rastro del actor (RN-08)', async () => {
    const mock = ideal();
    const r = await mock.abrir('disp-talanquera', 'operador-1');
    expect(r.aceptado).toBe(true);
    expect(mock.aperturas).toEqual([{ dispositivoId: 'disp-talanquera', actorId: 'operador-1' }]);
  });

  it('un dispositivo desconocido está fuera de línea y no se acciona', async () => {
    const mock = ideal();
    expect(await mock.estado('disp-inexistente')).toBe('fuera_de_linea');
    await expect(mock.abrir('disp-inexistente', 'op')).rejects.toBeInstanceOf(
      FalloDeHardwareSimulado,
    );
  });

  it('acumula la latencia de TODOS los intentos, no solo la del que acertó', async () => {
    const mock = new MockProvider({
      semilla: 3,
      perfil: {
        ...PERFIL_REALISTA,
        latenciaMsMin: 100,
        latenciaMsMax: 100,
        probabilidadDeFallo: 0,
      },
    });
    const antes = mock.reloj.ahora().getTime();
    const r = await mock.abrir('disp-talanquera', 'op');
    expect(r.latenciaMs).toBe(100);
    expect(mock.reloj.ahora().getTime() - antes).toBe(100);
  });

  it('se rinde tras agotar los intentos cuando el fallo es permanente', async () => {
    const mock = new MockProvider({
      semilla: 9,
      perfil: { ...PERFIL_IDEAL, probabilidadDeFallo: 1, intentos: 3 },
    });
    await expect(mock.abrir('disp-talanquera', 'op')).rejects.toThrow(/no respondió a abrir/);
  });

  it('reporta degradado cuando el equipo responde mal (KPI-26)', async () => {
    const mock = new MockProvider({ perfil: { ...PERFIL_IDEAL, probabilidadDeFallo: 1 } });
    expect(await mock.estado('disp-porteria')).toBe('degradado');
    const sano = ideal();
    expect(await sano.estado('disp-porteria')).toBe('en_linea');
  });
});

describe('MockProvider · lecturas de placa', () => {
  it('entrega la lectura a los suscriptores', async () => {
    const mock = ideal();
    const recibidas: LecturaDePlaca[] = [];
    await mock.suscribir(async (l) => {
      recibidas.push(l);
    });
    await mock.emitirLectura('ABC123', 'disp-talanquera');
    expect(recibidas).toHaveLength(1);
    expect(recibidas[0]?.placa).toBe('ABC123');
    expect(recibidas[0]?.confianza).toBeGreaterThanOrEqual(0.85);
  });

  it('CU-01 3a · emite lecturas por debajo del umbral cuando se le pide', async () => {
    const mock = new MockProvider({
      semilla: 5,
      perfil: { ...PERFIL_IDEAL, probabilidadDeBajaConfianza: 1 },
    });
    const l = await mock.emitirLectura('ABC123', 'disp-talanquera');
    expect(l.confianza).toBeLessThan(0.8);
  });

  it('RN-17 · duplica eventos: la ingesta idempotente tiene que verlo (CA-22)', async () => {
    const mock = new MockProvider({
      semilla: 11,
      perfil: { ...PERFIL_IDEAL, probabilidadDeDuplicado: 1 },
    });
    const recibidas: LecturaDePlaca[] = [];
    await mock.suscribir(async (l) => {
      recibidas.push(l);
    });
    await mock.emitirLectura('ABC123', 'disp-talanquera');
    expect(recibidas).toHaveLength(2);
    expect(recibidas[0]).toEqual(recibidas[1]);
  });
});

describe('MockProvider · plantillas faciales', () => {
  it('cumple el ciclo alta → presencia → supresión verificada (RN-11, CA-10)', async () => {
    const mock = ideal();
    await mock.sincronizar('disp-porteria', 'plt-1', new Uint8Array([1, 2, 3]));
    expect(mock.plantillas.get('disp-porteria')?.has('plt-1')).toBe(true);
    await mock.sincronizar('disp-porteria', 'plt-2', new Uint8Array([4]));
    await mock.suprimir('disp-porteria', 'plt-1');
    expect(mock.plantillas.get('disp-porteria')?.has('plt-1')).toBe(false);
    expect(mock.plantillas.get('disp-porteria')?.has('plt-2')).toBe(true);
  });

  it('no sincroniza una plantilla vacía (RN-11)', async () => {
    const mock = ideal();
    await expect(
      mock.sincronizar('disp-porteria', 'plt-0', new Uint8Array()),
    ).rejects.toBeInstanceOf(FalloDeHardwareSimulado);
    expect(mock.plantillas.has('disp-porteria')).toBe(false);
  });

  it('suprimir en un dispositivo sin plantillas no revienta', async () => {
    const mock = ideal();
    await expect(mock.suprimir('disp-porteria', 'plt-x')).resolves.toBeUndefined();
  });
});

describe('MockProvider · intercom (ADR-01)', () => {
  it('el canal es exclusivo: el segundo operador espera, no falla', async () => {
    const mock = ideal();
    expect(await mock.abrirSesion('disp-porteria', 'op-1')).toBe('abierta');
    expect(await mock.abrirSesion('disp-porteria', 'op-2')).toBe('en_espera');
    expect(await mock.abrirSesion('disp-porteria', 'op-1')).toBe('abierta');
    expect(await mock.estadoSesion()).toBe('abierta');
  });

  it('cerrar libera el canal y exige motivo', async () => {
    const mock = ideal();
    await mock.abrirSesion('disp-porteria', 'op-1');
    await expect(mock.cerrarSesion('  ')).rejects.toBeInstanceOf(FalloDeHardwareSimulado);
    await mock.cerrarSesion('fin de la llamada');
    expect(await mock.estadoSesion()).toBe('cerrada');
    expect(await mock.abrirSesion('disp-porteria', 'op-2')).toBe('abierta');
  });

  it('no se transmite audio sin sesión abierta', async () => {
    const mock = ideal();
    await expect(mock.enviarAudio(new Uint8Array([1]))).rejects.toBeInstanceOf(
      FalloDeHardwareSimulado,
    );
  });

  it('devuelve el audio recibido para ejercitar el puente', async () => {
    const mock = ideal();
    await mock.abrirSesion('disp-porteria', 'op-1');
    await mock.enviarAudio(new Uint8Array([7, 8]));
    const recibidos: Uint8Array[] = [];
    for await (const f of mock.recibirAudio()) recibidos.push(f);
    expect(recibidos).toEqual([new Uint8Array([7, 8])]);
  });

  it('cerrar sin sesión previa es idempotente', async () => {
    const mock = ideal();
    await expect(mock.cerrarSesion('sin sesión')).resolves.toBeUndefined();
    await expect(mock.cerrarSesion('   ')).rejects.toBeInstanceOf(FalloDeHardwareSimulado);
  });
});
