import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { SesionDeTunel, enlacesEnMemoria } from '@ncr/providers';
import type { EquipoRegistrado } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { TunelesDeEdge } from '../../proveedores';
import type { RutasDeEquipos } from '../../proveedores';
import type { LecturaParaElEdge } from '../aplicacion/puertos-del-puente';
import { pedirGuardar } from './credenciales-del-puente';
import { MigrarCredencialesAlEdge } from '../aplicacion/migrar-credenciales';
import type { CredencialesEnLaNube } from '../aplicacion/migrar-credenciales';

/**
 * 15-Q2 · D3 · la credencial que estaba en la nube se entrega al Edge y SÓLO
 * cuando el Edge confirma que el equipo autentica con ella se borra de la nube
 * (con su huella). Si no autentica, o el túnel falla, no se borra nada.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EDGE = 'a0000001-0000-4000-8000-000000000001';
const CAM = 'd0000001-0000-4000-8000-000000000001';
const RELE = 'd0000002-0000-4000-8000-000000000002';
const TERMINAL = 'd0000003-0000-4000-8000-000000000003';
const SECRETO_AS = 'secreto-de-alarm-server-de-prueba';

const ctx: ContextoTenant = {
  usuarioId: '00000000-0000-4000-8000-0000000000a1',
  rol: 'superadministrador',
  copropiedadId: null,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};

const claveDe = (id: string): string => `clave-${id.slice(0, 8)}-de-prueba`;
const completa = (id: string): EquipoRegistrado => ({
  dispositivoId: id,
  tipo: id === CAM ? 'camara_lpr' : 'rele',
  host: '192.0.2.20',
  puerto: 80,
  protocolo: 'http',
  usuario: 'operador-de-prueba',
  clave: claveDe(id),
});

/** La bóveda de la nube: `trasladar` la vacía, como la transacción de verdad. */
class NubeEnMemoria implements CredencialesEnLaNube {
  readonly traslados: { copropiedadId: string; id: string; edgeId: string; huella: string }[] = [];
  readonly consultas: string[] = [];
  constructor(
    private readonly historia: string[],
    readonly guardadas = new Map<string, EquipoRegistrado | null>(),
  ) {}
  async pendientes(copropiedadId: string) {
    this.consultas.push(copropiedadId);
    return [...this.guardadas.keys()];
  }
  async completa(id: string) {
    return this.guardadas.get(id) ?? null;
  }
  async trasladar(copropiedadId: string, id: string, edgeId: string, huella: string) {
    this.historia.push(`nube:trasladar:${id}`);
    this.traslados.push({ copropiedadId, id, edgeId, huella });
    this.guardadas.delete(id);
  }
}

type Respuesta = { autenticado: boolean; estado: string } | Error;

const montar = (
  o: { puente?: boolean; conTunel?: boolean; respuestas?: Record<string, Respuesta> } = {},
) => {
  const historia: string[] = [];
  const lineas: { mensaje: string; contexto: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (_n, mensaje, contexto) => void lineas.push({ mensaje, contexto }),
  };
  const rutas: RutasDeEquipos = {
    puenteDe: async () => null,
    edgeDe: async () => (o.puente === false ? null : EDGE),
    olvidar: (id) => void historia.push(`rutas:olvidar:${String(id)}`),
  };
  const tuneles = new TunelesDeEdge();
  const entregados: Record<string, unknown>[] = [];
  const [a, b] = enlacesEnMemoria();
  const edge = new SesionDeTunel(b, { paridad: 'impar' });
  const respuestas: Record<string, Respuesta> = o.respuestas ?? {};
  edge.atender('credencial.guardar', async (carga) => {
    const equipo = (carga as { equipo: Record<string, unknown> }).equipo;
    const id = String(equipo['dispositivoId']);
    historia.push(`edge:guardar:${id}`);
    entregados.push(equipo);
    const r = respuestas[id] ?? { autenticado: true, estado: 'en_linea' };
    if (r instanceof Error) throw r;
    return r;
  });
  if (o.conTunel !== false) {
    const api = new SesionDeTunel(a, { paridad: 'par' });
    tuneles.ocupar({ copropiedadId: COP, edgeId: EDGE, sesion: api, desde: new Date(0) });
  }
  const lectura: LecturaParaElEdge = {
    sinClave: async () => null,
    secretoDeCamara: async (_c, _cop, id) => (id === CAM ? SECRETO_AS : null),
  };
  const nube = new NubeEnMemoria(historia);
  for (const id of [CAM, RELE]) nube.guardadas.set(id, completa(id));
  const huellas: string[][] = [];
  const migrar = (t: TunelesDeEdge = tuneles) =>
    new MigrarCredencialesAlEdge(
      rutas,
      (cop, equipo) => pedirGuardar(t, cop, equipo),
      lectura,
      nube,
      (cop, id, clave) => {
        huellas.push([cop, id, clave]);
        return `huella-hmac-de-${id}`;
      },
      (id) => void historia.push(`proceso:olvidar:${id}`),
      bitacora,
    );
  return { migrar, nube, historia, entregados, huellas, lineas, respuestas };
};

describe('MigrarCredencialesAlEdge (15-Q2, D3)', () => {
  it('sin Edge puente: no consulta la nube y no hace nada', async () => {
    const m = montar({ puente: false });
    expect(await m.migrar().ejecutar(ctx, COP)).toEqual([]);
    expect(m.nube.consultas).toEqual([]);
    expect(m.entregados).toEqual([]);
  });

  it('el Edge confirma: recibe la credencial completa y DESPUÉS se borra de la nube, con huella', async () => {
    const m = montar();
    const r = await m.migrar().ejecutar(ctx, COP);
    expect(r).toEqual([
      { dispositivoId: CAM, trasladada: true, motivo: 'en el Edge; borrada de la nube' },
      { dispositivoId: RELE, trasladada: true, motivo: 'en el Edge; borrada de la nube' },
    ]);
    expect(m.entregados).toEqual([
      { ...completa(CAM), secretoAlarmServer: SECRETO_AS },
      completa(RELE),
    ]);
    expect(m.huellas).toEqual([
      [COP, CAM, claveDe(CAM)],
      [COP, RELE, claveDe(RELE)],
    ]);
    expect(m.nube.traslados).toEqual([
      { copropiedadId: COP, id: CAM, edgeId: EDGE, huella: `huella-hmac-de-${CAM}` },
      { copropiedadId: COP, id: RELE, edgeId: EDGE, huella: `huella-hmac-de-${RELE}` },
    ]);
    expect(m.historia.slice(0, 4)).toEqual([
      `edge:guardar:${CAM}`,
      `nube:trasladar:${CAM}`,
      `proceso:olvidar:${CAM}`,
      `rutas:olvidar:${CAM}`,
    ]);
  });

  it('el Edge NO autentica: la credencial sigue en la nube y se dice por qué', async () => {
    const m = montar({ respuestas: { [CAM]: { autenticado: false, estado: 'fuera_de_linea' } } });
    const [cam, rele] = await m.migrar().ejecutar(ctx, COP);
    expect(cam).toEqual({
      dispositivoId: CAM,
      trasladada: false,
      motivo: 'el Edge no pudo autenticarse con ella (fuera_de_linea): sigue en la nube',
    });
    expect(rele?.trasladada).toBe(true);
    expect(m.nube.traslados.map((t) => t.id)).toEqual([RELE]);
    expect(m.nube.guardadas.has(CAM)).toBe(true);
    expect(m.historia).not.toContain(`proceso:olvidar:${CAM}`);
  });

  it('una respuesta sin forma (sin `autenticado`, «"false"», 1) NO es un sí: no se borra', async () => {
    for (const rara of [{}, { autenticado: 'false', estado: 'en_linea' }, { autenticado: 1 }]) {
      const m = montar({ respuestas: { [RELE]: rara as unknown as Respuesta } });
      const r = await m.migrar().ejecutar(ctx, COP);
      expect(r.map((x) => x.trasladada)).toEqual([true, false]);
      expect(r[1]?.motivo).toMatch(/sin la forma del protocolo/);
      expect(m.nube.guardadas.has(RELE)).toBe(true);
    }
  });

  it('sin túnel: nada se borra, y el motivo lo dice equipo por equipo', async () => {
    const m = montar({ conTunel: false });
    const r = await m.migrar().ejecutar(ctx, COP);
    expect(r).toEqual(
      [CAM, RELE].map((dispositivoId) => ({
        dispositivoId,
        trasladada: false,
        motivo: 'sin entregar al Edge: el Edge del conjunto no está conectado',
      })),
    );
    expect(m.nube.traslados).toEqual([]);
    expect(m.nube.guardadas.size).toBe(2);
  });

  it('el Edge contesta con error: no se borra, y el motivo lleva su mensaje', async () => {
    const m = montar({ respuestas: { [CAM]: new Error('equipo apagado') } });
    const [cam] = await m.migrar().ejecutar(ctx, COP);
    expect(cam).toEqual({
      dispositivoId: CAM,
      trasladada: false,
      motivo: 'sin entregar al Edge: equipo apagado',
    });
    expect(m.nube.guardadas.has(CAM)).toBe(true);
  });

  it('un rechazo que no es Error también se informa, sin borrar', async () => {
    const m = montar();
    const tuneles = {
      sesionDe: () => ({ pedir: () => Promise.reject('corte crudo') }),
    } as unknown as TunelesDeEdge;
    const r = await m.migrar(tuneles).ejecutar(ctx, COP);
    expect(r[0]).toMatchObject({ trasladada: false, motivo: 'sin entregar al Edge: corte crudo' });
    expect(m.nube.traslados).toEqual([]);
  });

  it('un equipo sin credencial completa no se toca; los demás siguen', async () => {
    const m = montar();
    m.nube.guardadas.set(TERMINAL, null);
    const r = await m.migrar().ejecutar(ctx, COP);
    expect(r.find((x) => x.dispositivoId === TERMINAL)).toEqual({
      dispositivoId: TERMINAL,
      trasladada: false,
      motivo: 'el equipo no tiene credencial completa',
    });
    expect(m.entregados.map((e) => e['dispositivoId'])).toEqual([CAM, RELE]);
  });

  it('resumen en la bitácora; ninguna clave en resultados ni bitácora', async () => {
    const m = montar({ respuestas: { [RELE]: { autenticado: false, estado: 'degradado' } } });
    const r = await m.migrar().ejecutar(ctx, COP);
    expect(m.lineas).toEqual([
      {
        mensaje: 'migración de credenciales al Edge',
        contexto: { copropiedadId: COP, trasladadas: 1, pendientes: 1 },
      },
    ]);
    const visible = JSON.stringify([r, m.lineas]);
    for (const id of [CAM, RELE]) expect(visible).not.toContain(claveDe(id));
  });

  it('se puede volver a ejecutar: sólo mueve las que siguen en la nube', async () => {
    const m = montar({ respuestas: { [RELE]: { autenticado: false, estado: 'fuera_de_linea' } } });
    await m.migrar().ejecutar(ctx, COP);
    delete m.respuestas[RELE];
    const segunda = await m.migrar().ejecutar(ctx, COP);
    expect(segunda).toEqual([
      { dispositivoId: RELE, trasladada: true, motivo: 'en el Edge; borrada de la nube' },
    ]);
    expect(m.nube.traslados.map((t) => t.id)).toEqual([CAM, RELE]);
    expect(m.nube.guardadas.size).toBe(0);
  });
});
