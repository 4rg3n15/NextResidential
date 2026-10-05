import { describe, expect, it } from 'vitest';
import { FuenteDePlacas } from '../equipo/fuente-de-placas';
import { EquipoNoRegistrado } from '../hikvision/registro-de-equipos';
import type { ProveedorDeEquipos } from '../nucleo/proveedor';
import { enlacesEnMemoria } from './enlace-en-memoria';
import { ejecutarOrdenes, HechoYaResueltoEnElEdge } from './ejecutor-remoto';
import { EdgeDesconectado, ProtocoloInvalido } from './errores-remotos';
import { ProveedorRemoto } from './proveedor-remoto';
import { SesionDeTunel } from './sesion-de-tunel';

/**
 * 15-Q2 · B2 y C · el ejecutor del Edge y el proveedor remoto en lo que la
 * suite de contrato no puede decir: un solo actor, sólo equipos propios, sólo
 * órdenes de la lista, y el túnel caído traducido al lenguaje del puerto.
 */
const montar = (opciones: { padreVigente?: (p: string) => boolean; conoce?: string[] } = {}) => {
  const abiertas: string[] = [];
  const detenidas: string[] = [];
  const olvidados: string[] = [];
  const enviados: number[] = [];
  const registros: string[] = [];
  let fallarAudio = false;
  const real = {
    abrir: async (id: string) => {
      abiertas.push(id);
      return { aceptado: true, latenciaMs: 3 };
    },
    estado: async () => 'en_linea' as const,
    escuchar: async (id: string) => ({
      dispositivoId: id,
      transporte: 'escucha' as const,
      detalle: 'abierta',
      detener: () => void detenidas.push(id),
      ultimaSenal: () => null,
    }),
    olvidar: (id: string) => void olvidados.push(id),
    enviarAudioA: async (_id: string, trozo: Uint8Array) => {
      if (fallarAudio) throw new Error('el equipo rechazó el audio');
      enviados.push(...trozo);
    },
    enviarAudio: async (trozo: Uint8Array) => void enviados.push(100 + (trozo[0] ?? 0)),
    // Sin `recibirAudioDe`: el ejecutor cae en la sesión única del puerto.
    recibirAudio: async function* () {
      yield new Uint8Array([8]);
      if (fallarAudio) throw new Error('micrófono del equipo caído');
      yield new Uint8Array([9]);
    },
  } as unknown as ProveedorDeEquipos;
  const [a, b] = enlacesEnMemoria();
  const api = new SesionDeTunel(a, { paridad: 'par' });
  const edge = new SesionDeTunel(b, { paridad: 'impar' });
  const conoce = new Set(opciones.conoce ?? ['cam', 'portero']);
  ejecutarOrdenes(edge, real, {
    conoce: (id) => conoce.has(id),
    registrar: (m) => registros.push(m),
    ...(opciones.padreVigente === undefined ? {} : { padreVigente: opciones.padreVigente }),
  });
  let padre: string | undefined;
  const remoto = new ProveedorRemoto({
    sesion: () => api,
    fuente: new FuenteDePlacas(),
    padre: () => padre,
  });
  return {
    remoto,
    api,
    a,
    abiertas,
    detenidas,
    olvidados,
    enviados,
    registros,
    fallar: () => (fallarAudio = true),
    conPadre: (p: string) => (padre = p),
  };
};

const esperar = (ms = 15) => new Promise((r) => setTimeout(r, ms));

describe('ejecutor del Edge y proveedor remoto (15-Q2)', () => {
  it('B2 · un solo actor: la orden de un hecho que el Edge ya resolvió NO se ejecuta', async () => {
    const m = montar({ padreVigente: (p) => p !== 'hecho-resuelto' });
    m.conPadre('hecho-resuelto');
    await expect(m.remoto.abrir('cam', 'nube')).rejects.toBeInstanceOf(HechoYaResueltoEnElEdge);
    expect(m.abiertas).toEqual([]);
    m.conPadre('hecho-en-manos-de-la-nube');
    expect(await m.remoto.abrir('cam', 'nube')).toMatchObject({ aceptado: true });
    expect(m.abiertas).toEqual(['cam']);
    expect(m.registros).toEqual([expect.stringContaining('ya se resolvió en el Edge')]);
  });

  it('RN-15 · un equipo que el Edge no conoce es EquipoNoRegistrado, y no se toca', async () => {
    const m = montar({ conoce: ['cam'] });
    await expect(m.remoto.capacidadesDe('de-otro-conjunto')).rejects.toBeInstanceOf(
      EquipoNoRegistrado,
    );
  });

  it('fuera de protocolo: orden fuera de la lista, método que el equipo no tiene, canal sin número', async () => {
    const m = montar();
    const pedir = (nombre: string, carga: unknown) => m.api.pedir(nombre, carga, { plazoMs: 1000 });
    await expect(pedir('equipo', { metodo: 'leerClave', args: ['cam'] })).rejects.toBeInstanceOf(
      ProtocoloInvalido,
    );
    await expect(pedir('equipo', { metodo: 'fijarBloqueo', args: ['cam', true] })).rejects.toThrow(
      'no tiene «fijarBloqueo»',
    );
    await expect(pedir('audio.envio', { args: ['portero', 'x'] })).rejects.toBeInstanceOf(
      ProtocoloInvalido,
    );
  });

  it('C3 · con el túnel caído, abrir NO lanza: no aceptado con el motivo; estado fuera de línea', async () => {
    const m = montar();
    m.a.cortar();
    await esperar();
    const r = await m.remoto.abrir('cam', 'operador');
    expect(r).toMatchObject({ aceptado: false, rechazo: 'el Edge del conjunto no está conectado' });
    expect(await m.remoto.estado('cam')).toBe('fuera_de_linea');
    await expect(m.remoto.salidasDe('portero')).rejects.toBeInstanceOf(EdgeDesconectado);
  });

  it('sin sesión, el remoto falla en el acto con EdgeDesconectado', async () => {
    const remoto = new ProveedorRemoto({ sesion: () => null, fuente: new FuenteDePlacas() });
    await expect(remoto.capacidadesDe('cam')).rejects.toBeInstanceOf(EdgeDesconectado);
  });

  it('escuchar devuelve una escucha cuyo detener la cierra en el Edge; olvidar llega', async () => {
    const m = montar();
    const escucha = await m.remoto.escuchar('portero');
    expect(escucha).toMatchObject({ transporte: 'escucha', detalle: 'abierta' });
    expect(escucha.ultimaSenal?.()).toBeNull();
    escucha.detener();
    m.api.avisar('equipo.detener', { dispositivoId: 7 }); // sin forma: se ignora
    m.remoto.olvidar('portero');
    m.remoto.olvidar('de-otro-conjunto'); // RN-15: no llega al proveedor
    await esperar();
    expect(m.detenidas).toEqual(['portero']);
    expect(m.olvidados).toEqual(['portero']);
  });

  it('el audio sube EN ORDEN por un canal; un fallo del equipo se dice en el siguiente envío', async () => {
    const m = montar();
    for (const n of [1, 2, 3]) await m.remoto.enviarAudioA('portero', new Uint8Array([n]));
    await esperar();
    expect(m.enviados).toEqual([1, 2, 3]);
    m.fallar();
    await m.remoto.enviarAudioA('portero', new Uint8Array([4]));
    await new Promise((r) => m.a.alRecibir((d) => String(d).includes('audio.fallo') && r(0))); // DT-15M-C04
    await expect(m.remoto.enviarAudioA('portero', new Uint8Array([5]))).rejects.toThrow(
      'rechazó el audio',
    );
  });

  it('la sesión única del puerto: subida por enviarAudio, bajada en orden hasta el fin', async () => {
    const m = montar();
    await m.remoto.enviarAudio(new Uint8Array([1]));
    await esperar();
    expect(m.enviados).toEqual([101]);
    const leidos: number[] = [];
    for await (const trozo of m.remoto.recibirAudio()) leidos.push(...trozo);
    expect(leidos).toEqual([8, 9]);
    await m.remoto.cerrarSesion('fin').catch(() => undefined);
  });

  it('si el audio del equipo se corta, el canal se cierra y se registra; el lector termina', async () => {
    const m = montar();
    m.fallar();
    const leidos: number[] = [];
    for await (const trozo of m.remoto.recibirAudioDe('portero')) leidos.push(...trozo);
    expect(leidos).toEqual([8]);
    expect(m.registros).toEqual([expect.stringContaining('se cortó')]);
  });
});
