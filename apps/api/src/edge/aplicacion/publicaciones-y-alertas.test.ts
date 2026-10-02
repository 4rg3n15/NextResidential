import { describe, expect, it } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import {
  EquipoNoRegistrado,
  ProtocoloInvalido,
  SesionDeTunel,
  enlacesEnMemoria,
} from '@ncr/providers';
import type { PublicacionDeEquipo } from '@ncr/providers';
import { AuditoriaEnMemoria } from '../../comun/auditoria/auditoria-en-memoria';
import { TunelesDeEdge } from '../../proveedores';
import type { RutasDeEquipos } from '../../proveedores';
import { AlertaDeDesconexion, CLAVE_EDGE_DESCONECTADO } from './alerta-de-desconexion';
import { PublicacionesDelEdge } from './publicaciones-del-edge';
import type { GatewayRegistrado } from './puertos';

/**
 * 15-Q2 · B1/B2 y A3 · lo que el Edge publica entra por la MISMA fuente, dentro
 * de su hecho, y sólo por equipos de SU copropiedad; y su desconexión alerta.
 */
const COP_A = '10000000-0000-4000-8000-000000000001';
const COP_B = '10000000-0000-4000-8000-000000000002';
const bitacora: Bitacora = { registrar: () => undefined };
const gateway: GatewayRegistrado = {
  id: 'a0000001-0000-4000-8000-000000000001',
  copropiedadId: COP_A,
  nombre: 'Edge',
  usuarioServicioId: '00000000-0000-4000-8000-000000000003',
  credencialRef: 'env:INGESTA_FIRMA_SECRETO/g1',
  activo: true,
};
const rutas: RutasDeEquipos = {
  puenteDe: async (id) => ({ 'cam-a': COP_A, 'cam-b': COP_B })[id] ?? null,
  olvidar: () => undefined,
};
const publicacion = (dispositivoId: string) =>
  ({
    evento: { dispositivoId },
    foto: null,
    recorte: null,
    transporte: 'escucha',
  }) as unknown as PublicacionDeEquipo;

const montarPublicaciones = () => {
  const vistos: { hecho: string; dispositivoId: string }[] = [];
  let hecho = '';
  const auditoria = new AuditoriaEnMemoria();
  const publicaciones = new PublicacionesDelEdge(
    {
      publicar: async (p) => {
        vistos.push({ hecho, dispositivoId: p.evento.dispositivoId });
        return { desenlace: 'ingerida', motivo: null };
      },
    },
    rutas,
    auditoria,
    async (h, decidir) => {
      hecho = h;
      return decidir();
    },
    bitacora,
  );
  return { publicaciones, vistos, auditoria };
};

describe('PublicacionesDelEdge (15-Q2, B1/B2)', () => {
  it('se publica DENTRO del hecho del Edge, por la fuente compartida', async () => {
    const m = montarPublicaciones();
    const r = await m.publicaciones.publicar(
      { hechoId: 'hecho-1', publicacion: publicacion('cam-a') },
      gateway,
    );
    expect(r).toEqual({ desenlace: 'ingerida', motivo: null });
    expect(m.vistos).toEqual([{ hecho: 'hecho-1', dispositivoId: 'cam-a' }]);
  });

  it('RN-15 · por un equipo de OTRA copropiedad, o sin puente: no se publica y se audita', async () => {
    const m = montarPublicaciones();
    for (const id of ['cam-b', 'cam-sin-puente']) {
      await expect(
        m.publicaciones.publicar({ hechoId: 'h', publicacion: publicacion(id) }, gateway),
      ).rejects.toBeInstanceOf(EquipoNoRegistrado);
    }
    expect(m.vistos).toEqual([]);
    expect(m.auditoria.registros).toHaveLength(2);
  });

  it('sin hecho o sin equipo es fuera de protocolo', async () => {
    const m = montarPublicaciones();
    await expect(
      m.publicaciones.publicar({ publicacion: publicacion('cam-a') }, gateway),
    ).rejects.toBeInstanceOf(ProtocoloInvalido);
    await expect(
      m.publicaciones.publicar({ hechoId: 'h', publicacion: {} }, gateway),
    ).rejects.toBeInstanceOf(ProtocoloInvalido);
    await expect(m.publicaciones.publicar(null, gateway)).rejects.toBeInstanceOf(ProtocoloInvalido);
  });

  it('se instala como atención `publicacion` del túnel', async () => {
    const m = montarPublicaciones();
    const [a, b] = enlacesEnMemoria();
    const api = new SesionDeTunel(a, { paridad: 'par' });
    const edge = new SesionDeTunel(b, { paridad: 'impar' });
    m.publicaciones.instalar(api, gateway);
    const r = await edge.pedir(
      'publicacion',
      { hechoId: 'h2', publicacion: publicacion('cam-a') },
      { plazoMs: 1000 },
    );
    expect(r).toMatchObject({ desenlace: 'ingerida' });
  });
});

describe('AlertaDeDesconexion (15-Q2, A3)', () => {
  const montar = (equiposQueFallan = false) => {
    const tuneles = new TunelesDeEdge();
    const pendientes: (() => void)[] = [];
    const abiertas: { dispositivoId: string; clave: string; persistente: boolean }[] = [];
    const alerta = new AlertaDeDesconexion(
      tuneles,
      {
        activos: async () => {
          if (equiposQueFallan) throw new Error('base caída');
          return [
            { copropiedadId: COP_A, dispositivoId: 'cam-a' },
            { copropiedadId: COP_A, dispositivoId: 'portero-a' },
            { copropiedadId: COP_B, dispositivoId: 'cam-b' },
          ];
        },
      },
      { ejecutar: async (n) => void abiertas.push(n) },
      'actor',
      bitacora,
      30_000,
      { esperar: (_ms, hacer) => void pendientes.push(hacer) },
    );
    alerta.vigilar();
    const tunel = {
      copropiedadId: COP_A,
      edgeId: gateway.id,
      sesion: new SesionDeTunel(enlacesEnMemoria()[0], { paridad: 'par' }),
      desde: new Date(),
    };
    return { tuneles, pendientes, abiertas, alerta, tunel };
  };

  it('pasada la gracia sin volver: UNA alerta por equipo activo DEL conjunto, persistente', async () => {
    const m = montar();
    m.tuneles.ocupar(m.tunel);
    m.tuneles.liberar(m.tunel, new Date('2026-10-02T12:00:00Z'));
    expect(m.pendientes).toHaveLength(1);
    expect(await m.alerta.siSigue(COP_A, gateway.id)).toBe(2);
    expect(m.abiertas.map((a) => a.dispositivoId)).toEqual(['cam-a', 'portero-a']);
    expect(m.abiertas.every((a) => a.clave === CLAVE_EDGE_DESCONECTADO && a.persistente)).toBe(
      true,
    );
  });

  it('si vuelve dentro de la gracia, no se abre nada', async () => {
    const m = montar();
    m.tuneles.ocupar(m.tunel);
    m.tuneles.liberar(m.tunel, new Date());
    m.tuneles.ocupar({
      ...m.tunel,
      sesion: new SesionDeTunel(enlacesEnMemoria()[0], { paridad: 'par' }),
    });
    m.pendientes[0]?.();
    expect(await m.alerta.siSigue(COP_A, gateway.id)).toBe(0);
    expect(m.abiertas).toEqual([]);
  });

  it('si no se pueden leer los equipos, no lanza: lo dice la bitácora', async () => {
    const m = montar(true);
    expect(await m.alerta.siSigue(COP_A, gateway.id)).toBe(0);
  });
});
