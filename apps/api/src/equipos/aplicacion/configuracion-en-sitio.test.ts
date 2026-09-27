import { describe, expect, it, vi } from 'vitest';
import type { ContextoTenant } from '../../autenticacion';
import { CambiarVerificacionRemota, EnviarEventosAEsteMac } from './configuracion-en-sitio';
import type { ResolutorDeIpDelMac, SecretosDelAlarmServer } from './configuracion-en-sitio';
import type { CorrectorDeEquipo, DatosDeEquipo, DatosDeCorreccion } from './puertos';

/**
 * C2 y F2 (e) (corrección de la 15-L) · las dos acciones de la ficha, con
 * dobles: qué se le pide al equipo, qué queda en la auditoría —nunca el
 * secreto— y que el proceso olvida lo que recordaba del equipo.
 */
const ctx: ContextoTenant = {
  usuarioId: 'u-admin',
  rol: 'superadministrador',
  copropiedadId: 'cop-1',
  copropiedadesAtendidas: ['cop-1'],
  mfaVerificado: true,
};
const equipo = (tipo: DatosDeEquipo['tipo'], id = 'e-1'): DatosDeEquipo =>
  ({
    id,
    nombre: tipo === 'camara_lpr' ? 'Cámara de entrada' : 'Terminal peatonal',
    tipo,
    host: '198.51.100.40',
    puerto: 80,
    protocolo: 'http',
    usuario: 'servicio',
  }) as unknown as DatosDeEquipo;

const montar = (
  opciones: {
    equipos?: readonly DatosDeEquipo[];
    credencial?: string | null;
    secreto?: string | null;
    ip?: ReturnType<ResolutorDeIpDelMac['hacia']>;
  } = {},
) => {
  const pedidos: DatosDeCorreccion[] = [];
  const auditoria: string[] = [];
  const repo = {
    listar: vi.fn(
      async () => opciones.equipos ?? [equipo('camara_lpr'), equipo('terminal_facial', 'e-2')],
    ),
    credencialPara: vi.fn(async () =>
      opciones.credencial === undefined ? 'clave' : opciones.credencial,
    ),
    auditarCorreccion: vi.fn(
      async (_c: ContextoTenant, _cop: string, d: string) => void auditoria.push(d),
    ),
  };
  const corrector: CorrectorDeEquipo = {
    corregir: async (d) => {
      pedidos.push(d);
      return {
        correccion: d.correccion,
        aplicada: true,
        valorAnterior: 'antes',
        valorNuevo: 'despues',
        detalle: 'ok',
      };
    },
  };
  const ips: ResolutorDeIpDelMac = { hacia: () => opciones.ip ?? { ip: '198.51.100.23' } };
  const secretos: SecretosDelAlarmServer = {
    secretoDe: () => (opciones.secreto === undefined ? 's'.repeat(40) : opciones.secreto),
  };
  const olvido = { olvidar: vi.fn() };
  return {
    pedidos,
    auditoria,
    olvido,
    enviar: new EnviarEventosAEsteMac(repo, corrector, ips, secretos, 3000, olvido),
    cambiar: new CambiarVerificacionRemota(repo, corrector, olvido),
  };
};

describe('C2 · «Enviar eventos a este Mac»', () => {
  it('apunta la cámara a la IP del Mac, al puerto de la API y a su ruta con el secreto', async () => {
    const m = montar();
    const r = await m.enviar.ejecutar(ctx, 'cop-1', 'e-1', 'cambio de red');
    expect(r.ok).toBe(true);
    expect(m.pedidos[0]).toMatchObject({
      correccion: 'receptor_de_eventos',
      confirmadaPor: 'u-admin',
      receptor: { ip: '198.51.100.23', puerto: 3000, ruta: `/alarm-server/${'s'.repeat(40)}` },
    });
    // La auditoría dice de qué a qué, con el motivo, y NUNCA el secreto.
    expect(m.auditoria[0]).toBe(
      'Cámara de entrada · servidor de alarmas: antes → despues · cambio de red',
    );
    expect(m.auditoria.join()).not.toContain('ssss');
    expect(m.olvido.olvidar).toHaveBeenCalledWith('e-1');
  });

  it('otro equipo, otra copropiedad o sin credencial: no se toca nada', async () => {
    const m = montar();
    expect((await m.enviar.ejecutar(ctx, 'cop-1', 'no-existe', 'x')).ok).toBe(false);
    const t = await m.enviar.ejecutar(ctx, 'cop-1', 'e-2', 'x');
    expect(!t.ok && t.error.detalle).toMatch(/Sólo la cámara/);
    const sin = montar({ credencial: null });
    expect((await sin.enviar.ejecutar(ctx, 'cop-1', 'e-1', 'x')).ok).toBe(false);
    expect([...m.pedidos, ...sin.pedidos]).toEqual([]);
  });

  it('sin secreto declarado, o sin IP hacia la cámara, se dice por qué', async () => {
    const s = await montar({ secreto: null }).enviar.ejecutar(ctx, 'cop-1', 'e-1', 'x');
    expect(!s.ok && s.error.detalle).toMatch(/ALARM_SERVER_EQUIPOS/);
    const i = await montar({
      ip: { ip: null, motivo: 'el Mac no tiene IP en esa red' },
    }).enviar.ejecutar(ctx, 'cop-1', 'e-1', 'x');
    expect(!i.ok && i.error.detalle).toBe('el Mac no tiene IP en esa red');
  });
});

describe('F2 (e) · «Verificación remota: activar/desactivar»', () => {
  it('desactiva en la terminal, deja constancia y olvida', async () => {
    const m = montar();
    const r = await m.cambiar.ejecutar(ctx, 'cop-1', 'e-2', false, 'plan B en sitio');
    expect(r.ok).toBe(true);
    expect(m.pedidos[0]).toMatchObject({ correccion: 'verificacion_remota', activar: false });
    expect(m.auditoria[0]).toBe(
      'Terminal peatonal · verificación remota: antes → despues · plan B en sitio',
    );
    expect(m.olvido.olvidar).toHaveBeenCalledWith('e-2');
  });

  it('sólo en la terminal facial; el equipo que no existe no se toca', async () => {
    const m = montar();
    const c = await m.cambiar.ejecutar(ctx, 'cop-1', 'e-1', true, 'x');
    expect(!c.ok && c.error.detalle).toMatch(/terminal facial/);
    expect((await m.cambiar.ejecutar(ctx, 'cop-1', 'nadie', true, 'x')).ok).toBe(false);
    expect(m.pedidos).toEqual([]);
  });
});
