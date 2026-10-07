import { describe, expect, it } from 'vitest';
import { EdgeDesconectado, OrdenVencida } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';
import { esClaveEnElEdge } from '../../comun/credenciales-en-el-edge';
import type { CredencialesEnElEdge } from '../../comun/credenciales-en-el-edge';
import { SIN_PROBAR } from '../aplicacion/puertos';
import type {
  AltaDeEquipo,
  DatosDeEquipo,
  RepositorioDeEquipos,
  ResultadoDeSondeo,
} from '../aplicacion/puertos';
import { SecretosDeAlarmServerEnMemoria } from '../aplicacion/secretos-de-alarm-server';
import { RepositorioConCredencialEnElEdge, SecretosConEdge } from './credencial-en-el-edge';

/**
 * 15-Q2 · D2 · con puente, el secreto del equipo no se escribe en la nube: va
 * al Edge, y sin túnel no se escribe NADA. R1 · sin puente, el repositorio de
 * siempre recibe exactamente lo mismo que antes y el Edge no se entera.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const EDGE = 'a0000001-0000-4000-8000-000000000001';
const EQUIPO = 'd0000001-0000-4000-8000-000000000001';
const SECRETO = 'secreto-de-prueba-no-real';
const ctx: ContextoTenant = {
  usuarioId: '00000000-0000-4000-8000-0000000000a1',
  rol: 'administrador',
  copropiedadId: COP,
  copropiedadesAtendidas: [],
  mfaVerificado: true,
};
const DATOS = { id: EQUIPO, nombre: 'Cámara de prueba' } as unknown as DatosDeEquipo;
const ALTA_SIN_SECRETO: AltaDeEquipo = {
  nombre: 'Cámara de prueba',
  tipo: 'camara_lpr',
  host: '192.0.2.40',
  puerto: 80,
  protocolo: 'http',
  usuario: 'operador-de-prueba',
};
const ALTA: AltaDeEquipo = { ...ALTA_SIN_SECRETO, secreto: SECRETO };

interface Opciones {
  readonly puente?: boolean;
  readonly tunel?: boolean;
  readonly falloAlEntregar?: Error;
  readonly resultado?: DatosDeEquipo | null;
  readonly enLaNube?: string | null;
}

const montar = (o: Opciones = {}) => {
  const historia: string[] = [];
  const args: Record<string, unknown[]> = {};
  const anotar =
    (quien: string, valor: unknown) =>
    (...a: unknown[]) => {
      historia.push(quien);
      args[quien] = a;
      return Promise.resolve(valor);
    };
  const resultado = o.resultado === undefined ? DATOS : o.resultado;
  const base = {
    listar: anotar('base:listar', [DATOS]),
    activosQueEmiten: anotar('base:activosQueEmiten', []),
    activos: anotar('base:activos', []),
    copropiedadDeActivo: anotar('base:copropiedadDeActivo', COP),
    reactivar: anotar('base:reactivar', DATOS),
    auditarCorreccion: anotar('base:auditarCorreccion', undefined),
    registrarSondeo: anotar('base:registrarSondeo', DATOS),
    crear: anotar('base:crear', DATOS),
    editar: anotar('base:editar', resultado),
    desactivar: anotar('base:desactivar', resultado),
    credencialPara: anotar('base:credencialPara', o.enLaNube ?? null),
  } as unknown as RepositorioDeEquipos;
  const edge: CredencialesEnElEdge = {
    puenteDe: anotar('edge:puenteDe', o.puente === true ? EDGE : null) as () => Promise<null>,
    exigirTunel: (...a) => {
      historia.push('edge:exigirTunel');
      args['edge:exigirTunel'] = a;
      if (o.tunel === false) throw new EdgeDesconectado();
    },
    entregar: (...a) => {
      historia.push('edge:entregar');
      args['edge:entregar'] = a;
      return o.falloAlEntregar === undefined
        ? Promise.resolve({ autenticado: true, estado: 'en_linea' })
        : Promise.reject(o.falloAlEntregar);
    },
    retirar: anotar('edge:retirar', undefined) as () => Promise<void>,
    pedir: anotar('edge:pedir', null),
  };
  return { repo: new RepositorioConCredencialEnElEdge(base, edge), edge, historia, args };
};

describe('RepositorioConCredencialEnElEdge (15-Q2, D2)', () => {
  it('R1 · sin puente, crear pasa TODO (con el secreto) al repositorio de siempre', async () => {
    const m = montar();
    expect(await m.repo.crear(ctx, COP, ALTA, SIN_PROBAR)).toBe(DATOS);
    expect(m.historia).toEqual(['edge:puenteDe', 'base:crear']);
    expect(m.args['base:crear']).toEqual([ctx, COP, ALTA, SIN_PROBAR]);
  });

  it('con puente: exige túnel ANTES de escribir, guarda sin el secreto y se lo entrega al Edge', async () => {
    const m = montar({ puente: true });
    expect(await m.repo.crear(ctx, COP, ALTA, SIN_PROBAR)).toBe(DATOS);
    expect(m.historia).toEqual([
      'edge:puenteDe',
      'edge:exigirTunel',
      'base:crear',
      'edge:entregar',
    ]);
    expect(m.args['base:crear']).toEqual([ctx, COP, ALTA_SIN_SECRETO, SIN_PROBAR]);
    expect(JSON.stringify(m.args['base:crear'])).not.toContain(SECRETO);
    expect(m.args['edge:entregar']).toEqual([ctx, COP, EQUIPO, SECRETO]);
  });

  it('C3 · con puente y sin túnel: EdgeDesconectado, y no se escribe nada', async () => {
    const m = montar({ puente: true, tunel: false });
    await expect(m.repo.crear(ctx, COP, ALTA, SIN_PROBAR)).rejects.toBeInstanceOf(EdgeDesconectado);
    await expect(m.repo.editar(ctx, COP, EQUIPO, ALTA, SIN_PROBAR)).rejects.toBeInstanceOf(
      EdgeDesconectado,
    );
    expect(m.historia.filter((h) => h.startsWith('base:'))).toEqual([]);
  });

  it('con puente, un alta sin secreto le entrega null al Edge', async () => {
    const m = montar({ puente: true });
    await m.repo.crear(ctx, COP, ALTA_SIN_SECRETO, SIN_PROBAR);
    expect(m.args['edge:entregar']).toEqual([ctx, COP, EQUIPO, null]);
  });

  it('si la entrega falla DESPUÉS de crear, el alta se deshace (baja lógica) y el error sube', async () => {
    const m = montar({
      puente: true,
      falloAlEntregar: new OrdenVencida('credencial.guardar', 15_000),
    });
    await expect(m.repo.crear(ctx, COP, ALTA, SIN_PROBAR)).rejects.toBeInstanceOf(OrdenVencida);
    expect(m.historia.slice(-3)).toEqual(['base:crear', 'edge:entregar', 'base:desactivar']);
    expect(m.args['base:desactivar']?.[3]).toMatch(/^Alta revertida/);
  });

  it('R1 · sin puente, editar pasa la edición completa', async () => {
    const m = montar();
    await m.repo.editar(ctx, COP, EQUIPO, ALTA, SIN_PROBAR);
    expect(m.historia).toEqual(['edge:puenteDe', 'base:editar']);
    expect(m.args['base:editar']).toEqual([ctx, COP, EQUIPO, ALTA, SIN_PROBAR]);
  });

  it('con puente, editar sin secreto también avisa al Edge (null: conserva el suyo)', async () => {
    const m = montar({ puente: true });
    expect(await m.repo.editar(ctx, COP, EQUIPO, ALTA_SIN_SECRETO, SIN_PROBAR)).toBe(DATOS);
    expect(m.historia).toEqual([
      'edge:puenteDe',
      'edge:exigirTunel',
      'base:editar',
      'edge:entregar',
    ]);
    expect(m.args['edge:entregar']).toEqual([ctx, COP, EQUIPO, null]);
  });

  it('con puente, editar con secreto lo entrega y no lo escribe; equipo inexistente: no entrega', async () => {
    const m = montar({ puente: true });
    await m.repo.editar(ctx, COP, EQUIPO, ALTA, SIN_PROBAR);
    expect(m.args['base:editar']).toEqual([ctx, COP, EQUIPO, ALTA_SIN_SECRETO, SIN_PROBAR]);
    expect(m.args['edge:entregar']).toEqual([ctx, COP, EQUIPO, SECRETO]);
    const otro = montar({ puente: true, resultado: null });
    expect(await otro.repo.editar(ctx, COP, EQUIPO, ALTA, SIN_PROBAR)).toBeNull();
    expect(otro.historia).not.toContain('edge:entregar');
  });

  it('desactivar: primero la base; con puente el Edge la retira; sin puente o sin equipo, no', async () => {
    const con = montar({ puente: true });
    await con.repo.desactivar(ctx, COP, EQUIPO, 'baja de prueba');
    expect(con.historia).toEqual(['base:desactivar', 'edge:puenteDe', 'edge:retirar']);
    expect(con.args['edge:retirar']).toEqual([COP, EQUIPO]);
    const sin = montar();
    await sin.repo.desactivar(ctx, COP, EQUIPO, 'baja de prueba');
    expect(sin.historia).toEqual(['base:desactivar', 'edge:puenteDe']);
    const inexistente = montar({ puente: true, resultado: null });
    expect(await inexistente.repo.desactivar(ctx, COP, EQUIPO, 'x')).toBeNull();
    expect(inexistente.historia).toEqual(['base:desactivar']);
  });

  it('credencialPara: la de la nube si la hay; si no, con puente `edge:<equipo>`; sin puente null', async () => {
    const enLaNube = montar({ puente: true, enLaNube: 'aun-en-la-nube' });
    expect(await enLaNube.repo.credencialPara(ctx, COP, EQUIPO)).toBe('aun-en-la-nube');
    expect(enLaNube.historia).toEqual(['base:credencialPara']);
    const directo = montar();
    expect(await directo.repo.credencialPara(ctx, COP, EQUIPO)).toBeNull();
    const puente = montar({ puente: true });
    const clave = await puente.repo.credencialPara(ctx, COP, EQUIPO);
    expect(clave).toBe(`edge:${EQUIPO}`);
    expect(esClaveEnElEdge(clave ?? '')).toBe(true);
  });

  /**
   * C.1 (corrección 15-S1) · con puente, el Edge decide el video con SU copia
   * del equipo: si «Probar conexión» guarda capacidades o canal nuevos en la
   * nube y no se los entrega, el Edge sigue pidiendo el 102 de la ficha.
   */
  it('C.1 · con puente, un sondeo con capacidades o canal nuevos se entrega al Edge, sin clave', async () => {
    const m = montar({ puente: true });
    const sondeado: ResultadoDeSondeo = {
      clase: 'alcanzado',
      detalle: 'El equipo responde y acepta la credencial',
      modelo: null,
      firmware: null,
      latenciaMs: 30,
      verificado: true,
      canalDeVideo: '101',
    };
    await m.repo.registrarSondeo(ctx, COP, EQUIPO, sondeado);
    expect(m.historia).toEqual(['base:registrarSondeo', 'edge:puenteDe', 'edge:entregar']);
    expect(m.args['edge:entregar']).toEqual([ctx, COP, EQUIPO, null]);
  });

  it('C.1 · sin puente, el mismo sondeo no avisa a nadie', async () => {
    const m = montar();
    await m.repo.registrarSondeo(ctx, COP, EQUIPO, { ...SIN_PROBAR, canalDeVideo: '101' });
    expect(m.historia).toEqual(['base:registrarSondeo', 'edge:puenteDe']);
  });

  it('el resto delega tal cual, sin preguntar por el puente', async () => {
    const m = montar({ puente: true });
    await m.repo.listar(ctx, COP);
    await m.repo.activosQueEmiten();
    await m.repo.activos();
    await m.repo.copropiedadDeActivo(EQUIPO);
    await m.repo.reactivar(ctx, COP, EQUIPO);
    await m.repo.auditarCorreccion(ctx, COP, 'detalle');
    await m.repo.registrarSondeo(ctx, COP, EQUIPO, SIN_PROBAR);
    expect(m.historia.every((h) => h.startsWith('base:'))).toBe(true);
    expect(m.historia).toHaveLength(7);
    expect(m.args['base:registrarSondeo']).toEqual([ctx, COP, EQUIPO, SIN_PROBAR]);
    expect(m.args['base:auditarCorreccion']).toEqual([ctx, COP, 'detalle']);
  });
});

describe('SecretosConEdge (15-Q2, D2)', () => {
  const montarSecretos = (puente: boolean) => {
    const base = new SecretosDeAlarmServerEnMemoria();
    const entregas: { args: unknown[]; secretoYaEmitido: string | null }[] = [];
    const edge = {
      puenteDe: async () => (puente ? EDGE : null),
      entregar: async (c: ContextoTenant, cop: string, id: string, clave: string | null) => {
        entregas.push({
          args: [c, cop, id, clave],
          secretoYaEmitido: await base.secretoDe(c, cop, id),
        });
        return { autenticado: true, estado: 'en_linea' as const };
      },
    } as unknown as CredencialesEnElEdge;
    return { secretos: new SecretosConEdge(base, edge), entregas };
  };
  const CAMARA = { id: EQUIPO, host: '192.0.2.40' };

  it('R1 · sin puente: emite como siempre y el Edge no se entera', async () => {
    const m = montarSecretos(false);
    const secreto = await m.secretos.emitir(ctx, COP, CAMARA);
    expect(secreto.length).toBeGreaterThanOrEqual(32);
    expect(m.entregas).toEqual([]);
  });

  it('con puente: tras emitir, el Edge recibe el equipo otra vez (sin clave) para tener el secreto', async () => {
    const m = montarSecretos(true);
    const secreto = await m.secretos.emitir(ctx, COP, CAMARA);
    expect(m.entregas).toEqual([{ args: [ctx, COP, EQUIPO, null], secretoYaEmitido: secreto }]);
  });

  it('secretoDe y equipoPorSecreto delegan en el de siempre', async () => {
    const m = montarSecretos(true);
    const secreto = await m.secretos.emitir(ctx, COP, CAMARA);
    expect(await m.secretos.secretoDe(ctx, COP, EQUIPO)).toBe(secreto);
    expect(await m.secretos.equipoPorSecreto(secreto)).toMatchObject({
      dispositivoId: EQUIPO,
      copropiedadId: COP,
    });
  });
});
