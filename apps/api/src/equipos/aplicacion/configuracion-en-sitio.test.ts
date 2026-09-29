import { describe, expect, it, vi } from 'vitest';
import type { ContextoTenant } from '../../autenticacion';
import {
  CambiarVerificacionRemota,
  DesactivarReceptorHuerfano,
  EnviarEventosAEsteMac,
} from './configuracion-en-sitio';
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
    secretoPara: async () => opciones.secreto ?? 's'.repeat(40),
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
    // E4 (15-M) · la terminal y el videoportero SÍ admiten el receptor; el relé no.
    const r = montar({ equipos: [equipo('camara_lpr'), equipo('rele', 'e-2')] });
    const t = await r.enviar.ejecutar(ctx, 'cop-1', 'e-2', 'x');
    expect(!t.ok && t.error.detalle).toMatch(/no publica en un servidor de alarmas/);
    expect(r.pedidos).toEqual([]);
    const sin = montar({ credencial: null });
    expect((await sin.enviar.ejecutar(ctx, 'cop-1', 'e-1', 'x')).ok).toBe(false);
    expect([...m.pedidos, ...sin.pedidos]).toEqual([]);
  });

  it('sin IP hacia la cámara, se dice por qué (el secreto ya no falta nunca: C6 lo emite)', async () => {
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

/** E4 (15-M) · el receptor huérfano de terminal y videoportero, y el push para el videoportero. */
describe('E4 · «Desactivar el receptor huérfano» y «Enviar eventos» en el videoportero', () => {
  const montarE4 = () => {
    const pedidos: DatosDeCorreccion[] = [];
    const auditoria: string[] = [];
    const repo = {
      listar: vi.fn(async () => [
        equipo('camara_lpr'),
        equipo('terminal_facial', 'e-2'),
        { ...equipo('intercom', 'e-3'), nombre: 'Videoportero' } as DatosDeEquipo,
      ]),
      credencialPara: vi.fn(async () => 'clave'),
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
          valorAnterior: '192.0.2.140:8080',
          valorNuevo: 'apagado',
          detalle: 'ok',
        };
      },
    };
    const olvido = { olvidar: vi.fn() };
    const ips: ResolutorDeIpDelMac = { hacia: () => ({ ip: '198.51.100.23' }) };
    const secretos = {
      secretoPara: async () => 'secreto-de-prueba',
    } as unknown as SecretosDelAlarmServer;
    return {
      pedidos,
      auditoria,
      olvido,
      desactivar: new DesactivarReceptorHuerfano(repo, corrector, olvido),
      enviar: new EnviarEventosAEsteMac(repo, corrector, ips, secretos, 3000, olvido),
    };
  };

  it('apaga el receptor de la terminal y del videoportero, con constancia y olvido', async () => {
    const m = montarE4();
    for (const id of ['e-2', 'e-3']) {
      const r = await m.desactivar.ejecutar(ctx, 'cop-1', id, 'resto de otra plataforma');
      expect(r.ok).toBe(true);
      expect(m.olvido.olvidar).toHaveBeenCalledWith(id);
    }
    expect(m.pedidos.map((p) => p.correccion)).toEqual([
      'desactivar_receptor',
      'desactivar_receptor',
    ]);
    expect(m.pedidos[0]?.confirmadaPor).toBe('u-admin');
    expect(m.auditoria[1]).toMatch(
      /Videoportero · receptor huérfano: 192\.0\.2\.140:8080 → apagado/,
    );
    expect(m.auditoria.join(' ')).not.toContain('clave');
  });

  it('la cámara NO tiene receptor huérfano: se rechaza con el remedio', async () => {
    const m = montarE4();
    const r = await m.desactivar.ejecutar(ctx, 'cop-1', 'e-1', 'x');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.detalle).toMatch(/Enviar eventos a este Mac/);
    expect(m.pedidos).toEqual([]);
  });

  it('«Enviar eventos a este Mac» también en el videoportero (E4 · 8)', async () => {
    const m = montarE4();
    const r = await m.enviar.ejecutar(ctx, 'cop-1', 'e-3', 'la escucha no basta en sitio');
    expect(r.ok).toBe(true);
    expect(m.pedidos[0]).toMatchObject({
      correccion: 'receptor_de_eventos',
      receptor: { ip: '198.51.100.23', puerto: 3000, ruta: '/alarm-server/secreto-de-prueba' },
    });
  });
});
