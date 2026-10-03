import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  EquipoNoRegistrado,
  ProtocoloInvalido,
  SesionDeTunel,
  enlacesEnMemoria,
  equiposSimulados,
} from '@ncr/providers';
import type { Enlace, ProveedorDeEquipos } from '@ncr/providers';
import { RegistroCifrado } from '../equipos/registro-cifrado';
import type { EquipoDelPuente } from '../equipos/registro-cifrado';
import type { CamaraDelEdge } from '../http/servidor-local';
import { DatabaseSync } from '../sqlite/motor';
import { Go2rtcLocal } from '../video/go2rtc-local';
import { atenderLaNube, sincronizarCamaras } from './atenciones-del-edge';

/**
 * 15-Q2 · lo que el Edge atiende de la nube además de las órdenes del puerto:
 * credenciales (que entran y NUNCA vuelven), bajas, diagnóstico con la clave
 * del registro sólo contra SU host, y la oferta de video al go2rtc local.
 */
const CAMARA = '90000000-0000-4000-8000-000000000001';
const TERMINAL = '90000000-0000-4000-8000-000000000002';
const HOST_CAMARA = 'camara-puente.simulado.invalid';
const CLAVE = 'clave-del-equipo-que-nunca-vuelve-a-la-nube';
const SECRETO = 'secreto-de-la-camara-hacia-el-edge-sin-valor';
const RTSP = `rtsp://servicio:${CLAVE}@${HOST_CAMARA}:554/Streaming/Channels/101`;
const SDP = 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\ns=-\r\n';

const equipo = (cambios: Record<string, unknown> = {}) => ({
  dispositivoId: CAMARA,
  tipo: 'camara_lpr',
  host: HOST_CAMARA,
  puerto: 80,
  protocolo: 'http',
  usuario: 'servicio',
  clave: CLAVE,
  secretoAlarmServer: SECRETO,
  ...cambios,
});

/** El mismo objeto sin esas claves: lo que la nube manda cuando no las cambia. */
const sin = (o: Record<string, unknown>, ...claves: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([k]) => !claves.includes(k)));

const montar = (opciones: { estado?: () => Promise<string>; origen?: string | null } = {}) => {
  const registro = new RegistroCifrado(new DatabaseSync(':memory:'), randomBytes(32));
  const olvidados: string[] = [];
  const proveedor = {
    estado: vi.fn(opciones.estado ?? (async () => 'en_linea')),
    olvidar: (id: string) => void olvidados.push(id),
    origenDeVideo: vi.fn(async () => {
      const rtsp = opciones.origen === undefined ? RTSP : opciones.origen;
      return rtsp === null ? null : { rtsp, flujo: 'principal', detalle: '' };
    }),
  };
  const go2rtc: string[] = [];
  const video = new Go2rtcLocal('http://127.0.0.1:1984', (async (url: string | URL) => {
    go2rtc.push(String(url));
    return new Response(String(url).includes('/api/webrtc') ? SDP : '', { status: 200 });
  }) as typeof fetch);
  const simulado = equiposSimulados({
    [HOST_CAMARA]: { familia: 'comun', usuario: 'servicio', clave: CLAVE },
  });
  const destinos: string[] = [];
  const peticion = (async (entrada: string | URL, init?: RequestInit) => {
    destinos.push(new URL(String(entrada)).hostname);
    return simulado(entrada, init);
  }) as typeof fetch;
  const camaras: CamaraDelEdge[] = [];

  const [a, b] = enlacesEnMemoria();
  // Todo lo que el Edge escribe en el túnel, para comprobar qué NO sale de él.
  const delEdge: string[] = [];
  const espia: Enlace = {
    ...b,
    enviar: (dato) => {
      delEdge.push(typeof dato === 'string' ? dato : Buffer.from(dato).toString('latin1'));
      b.enviar(dato);
    },
  };
  const nube = new SesionDeTunel(a, { paridad: 'par' });
  atenderLaNube(new SesionDeTunel(espia, { paridad: 'impar' }), {
    registro,
    proveedor: proveedor as unknown as ProveedorDeEquipos,
    camaras,
    video,
    ahora: () => new Date('2026-10-01T10:00:00.000Z'),
    peticion,
  });
  const pedir = (nombre: string, carga: unknown) => nube.pedir(nombre, carga, { plazoMs: 5_000 });
  return { registro, proveedor, olvidados, camaras, go2rtc, destinos, delEdge, nube, pedir };
};

const esperar = (ms = 15) => new Promise((r) => setTimeout(r, ms));

describe('credencial.guardar', () => {
  it('guarda cifrado, sincroniza el receptor y contesta si autentica, SIN devolver la clave', async () => {
    const m = montar();
    expect(await m.pedir('credencial.guardar', { equipo: equipo() })).toEqual({
      autenticado: true,
      estado: 'en_linea',
    });
    expect((await m.registro.buscar(CAMARA))?.clave).toBe(CLAVE);
    expect(m.olvidados).toEqual([CAMARA]);
    expect(m.camaras).toEqual([{ dispositivoId: CAMARA, host: HOST_CAMARA, secreto: SECRETO }]);
    expect(m.delEdge.length).toBeGreaterThan(0);
    expect(m.delEdge.join('\n')).not.toContain(CLAVE);
  });

  it('sin clave conserva la que había (y el secreto del receptor); un fallo del estado es «fuera de línea»', async () => {
    const m = montar({ estado: () => Promise.reject(new Error('sin red')) });
    await m.pedir('credencial.guardar', { equipo: equipo() });
    const sinSecretos = sin(equipo({ puerto: 8080 }), 'clave', 'secretoAlarmServer');
    expect(await m.pedir('credencial.guardar', { equipo: sinSecretos })).toEqual({
      autenticado: false,
      estado: 'fuera_de_linea',
    });
    expect(await m.registro.buscar(CAMARA)).toMatchObject({
      puerto: 8080,
      clave: CLAVE,
      secretoAlarmServer: SECRETO,
    });
    expect(m.camaras).toHaveLength(1);
  });

  it('sin clave y sin una anterior: EquipoNoRegistrado, y no guarda nada', async () => {
    const m = montar();
    await expect(
      m.pedir('credencial.guardar', { equipo: sin(equipo(), 'clave') }),
    ).rejects.toBeInstanceOf(EquipoNoRegistrado);
    await expect(
      m.pedir('credencial.guardar', { equipo: equipo({ usuario: null }) }),
    ).rejects.toBeInstanceOf(EquipoNoRegistrado);
    expect(m.registro.todos()).toEqual([]);
    expect(m.proveedor.estado).not.toHaveBeenCalled();
  });

  it.each([
    ['sin equipo', {}],
    ['con un identificador que no es UUID', { equipo: equipo({ dispositivoId: 'cam-1' }) }],
    ['con un tipo desconocido', { equipo: equipo({ tipo: 'tostadora' }) }],
    ['nula', null],
  ])('una carga %s es ProtocoloInvalido', async (_caso, carga) => {
    const m = montar();
    await expect(m.pedir('credencial.guardar', carga)).rejects.toBeInstanceOf(ProtocoloInvalido);
  });
});

describe('bajas: credencial.retirar y el aviso equipos.vigentes', () => {
  const conDos = async () => {
    const m = montar();
    await m.pedir('credencial.guardar', { equipo: equipo() });
    const terminal = equipo({ dispositivoId: TERMINAL, tipo: 'terminal_facial' });
    await m.pedir('credencial.guardar', { equipo: sin(terminal, 'secretoAlarmServer') });
    m.olvidados.length = 0;
    return m;
  };

  it('credencial.retirar saca el equipo del registro, del proveedor y del receptor', async () => {
    const m = await conDos();
    expect(await m.pedir('credencial.retirar', { dispositivoId: CAMARA })).toBeNull();
    expect(m.registro.todos().map((e) => e.dispositivoId)).toEqual([TERMINAL]);
    expect(m.olvidados).toEqual([CAMARA]);
    expect(m.camaras).toEqual([]);
    await expect(m.pedir('credencial.retirar', { dispositivoId: 7 })).rejects.toBeInstanceOf(
      ProtocoloInvalido,
    );
    await expect(m.pedir('credencial.retirar', null)).rejects.toBeInstanceOf(ProtocoloInvalido);
  });

  it('equipos.vigentes retira los que la nube ya no tiene', async () => {
    const m = await conDos();
    m.nube.avisar('equipos.vigentes', { vigentes: [TERMINAL, 42] });
    await esperar();
    expect(m.registro.todos().map((e) => e.dispositivoId)).toEqual([TERMINAL]);
    expect(m.olvidados).toEqual([CAMARA]);
    expect(m.camaras).toEqual([]);
  });

  it('equipos.vigentes sin lista se ignora: no se borra nada', async () => {
    const m = await conDos();
    m.nube.avisar('equipos.vigentes', { vigentes: 'todos' });
    m.nube.avisar('equipos.vigentes', null);
    await esperar();
    expect(m.registro.todos()).toHaveLength(2);
    expect(m.olvidados).toEqual([]);
  });
});

describe('equipo.diagnosticar / equipo.corregir · la clave del registro, sólo para SU host', () => {
  const operacion = (cambios: Record<string, unknown> = {}) => ({
    host: HOST_CAMARA,
    puerto: 80,
    protocolo: 'http',
    usuario: 'servicio',
    clave: `edge:${CAMARA}`,
    familia: 'comun',
    ...cambios,
  });

  it('`edge:<equipo>` contra el host de ese equipo presenta la clave guardada', async () => {
    const m = montar();
    await m.pedir('credencial.guardar', { equipo: equipo() });
    const d = (await m.pedir('equipo.diagnosticar', operacion())) as {
      contacto: { clase: string };
    };
    expect(d.contacto.clase).toBe('alcanzado');
    expect(m.destinos.length).toBeGreaterThan(0);
    expect(m.destinos.every((h) => h === HOST_CAMARA)).toBe(true);
    expect(m.delEdge.join('\n')).not.toContain(CLAVE);
  });

  it('una clave que no es una referencia pasa tal cual: con una equivocada, el equipo la rechaza', async () => {
    const m = montar();
    const d = (await m.pedir('equipo.diagnosticar', operacion({ clave: 'clave-equivocada' }))) as {
      contacto: { clase: string };
    };
    expect(d.contacto.clase).toBe('credencial');
  });

  it.each([
    ['equipo.diagnosticar', 'otro-host.simulado.invalid', CAMARA],
    ['equipo.corregir', 'otro-host.simulado.invalid', CAMARA],
    ['equipo.diagnosticar', HOST_CAMARA, TERMINAL],
  ])(
    '%s contra %s con la referencia de %s: EquipoNoRegistrado y ninguna petición sale',
    async (nombre, host, referido) => {
      const m = montar();
      await m.pedir('credencial.guardar', { equipo: equipo() });
      const carga = operacion({ host, clave: `edge:${referido}`, clase: 'modo_de_control' });
      await expect(m.pedir(nombre, carga)).rejects.toBeInstanceOf(EquipoNoRegistrado);
      expect(m.destinos).toEqual([]);
    },
  );
});

describe('video.whep · la oferta del navegador al go2rtc local', () => {
  const whep = (cambios: Record<string, unknown> = {}) => ({
    dispositivoId: CAMARA,
    nombre: 'camara-porteria',
    ofertaSdp: 'v=0\r\ns=-',
    ...cambios,
  });

  it('negocia con el go2rtc local; el RTSP con la credencial no vuelve por el túnel', async () => {
    const m = montar();
    await m.pedir('credencial.guardar', { equipo: equipo() });
    expect(await m.pedir('video.whep', whep())).toBe(SDP);
    expect(m.proveedor.origenDeVideo).toHaveBeenCalledWith(CAMARA);
    expect(decodeURIComponent(m.go2rtc[0] ?? '')).toContain(RTSP);
    expect(m.delEdge.join('\n')).not.toContain(CLAVE);
  });

  it.each([
    ['un nombre de flujo con caracteres fuera de la lista', whep({ nombre: '../otro flujo' })],
    ['un nombre de flujo que no es texto', whep({ nombre: 7 })],
    ['sin oferta', whep({ ofertaSdp: undefined })],
    ['sin equipo', whep({ dispositivoId: undefined })],
    ['una carga nula', null],
  ])('%s es ProtocoloInvalido', async (_caso, carga) => {
    const m = montar();
    await m.pedir('credencial.guardar', { equipo: equipo() });
    await expect(m.pedir('video.whep', carga)).rejects.toBeInstanceOf(ProtocoloInvalido);
    expect(m.go2rtc).toEqual([]);
  });

  it('un equipo que el Edge no tiene es EquipoNoRegistrado, sin preguntar al proveedor', async () => {
    const m = montar();
    await expect(m.pedir('video.whep', whep())).rejects.toBeInstanceOf(EquipoNoRegistrado);
    expect(m.proveedor.origenDeVideo).not.toHaveBeenCalled();
  });

  it('un equipo sin video lo dice, sin llamar al go2rtc', async () => {
    const m = montar({ origen: null });
    await m.pedir('credencial.guardar', { equipo: equipo() });
    await expect(m.pedir('video.whep', whep())).rejects.toThrow(
      'este tipo de equipo no emite video',
    );
    expect(m.go2rtc).toEqual([]);
  });
});

describe('sincronizarCamaras', () => {
  it('reescribe EN SITIO la lista del receptor: sólo los equipos con secreto de receptor', () => {
    const m = montar();
    m.registro.guardar(equipo() as EquipoDelPuente, new Date());
    const terminal = sin(equipo({ dispositivoId: TERMINAL }), 'secretoAlarmServer');
    m.registro.guardar(terminal as unknown as EquipoDelPuente, new Date());
    const lista: CamaraDelEdge[] = [
      { dispositivoId: 'viejo', host: 'viejo.invalid', secreto: 'x' },
    ];
    sincronizarCamaras(m.registro, lista);
    expect(lista).toEqual([{ dispositivoId: CAMARA, host: HOST_CAMARA, secreto: SECRETO }]);
  });
});
