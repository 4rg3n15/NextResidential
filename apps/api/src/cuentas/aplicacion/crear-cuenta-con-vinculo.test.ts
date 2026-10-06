import { describe, expect, it } from 'vitest';
import type { CorreoSintetico } from '../dominio/correo-sintetico';
import { RepositorioDeCuentasEnMemoria } from '../infraestructura/repositorio-cuentas-memoria';
import { CrearCuentaPorUsuario } from './crear-cuenta';
import type { AdministradorDeCuentas, CuentaCreada } from './puertos';
import type { EjecutorDelAlta, EscrituraDelVinculo } from './puertos-del-registro';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-W (D1, D2) · LA CUENTA Y SU VÍNCULO, O NINGUNO DE LOS DOS
 *
 * La carrera de dos altas sobre la misma plaza —o la misma titularidad— la
 * decide la base, y el perdedor ya creó su identidad en el proveedor. Contra la
 * base real ese orden depende del azar (`autorregistro.e2e`); aquí se fuerza:
 * el vínculo dice «no», la cuenta no queda y su identidad se BORRA.
 * ═════════════════════════════════════════════════════════════════════════════
 */
class ProveedorQueRecuerda implements AdministradorDeCuentas {
  readonly vivas = new Set<string>();
  readonly eliminadas: string[] = [];
  private n = 0;
  async crear(_correo: CorreoSintetico, _contrasena: string): Promise<CuentaCreada> {
    this.n += 1;
    const authUserId = `auth-${String(this.n)}`;
    this.vivas.add(authUserId);
    return { ok: true, authUserId };
  }
  async fijarContrasena(): Promise<void> {}
  async eliminar(authUserId: string): Promise<void> {
    this.vivas.delete(authUserId);
    this.eliminadas.push(authUserId);
  }
}

const COP = '10000000-0000-4000-8000-0000000000aa';
const solicitud = {
  copropiedadId: COP,
  usuario: 'ana.perez',
  nombre: 'ana.perez',
  telefono: null,
  rol: 'residente' as const,
  contrasenaInicial: 'Hogar#2026xy',
  origen: 'autorregistro' as const,
  debeCambiarContrasena: false,
};
const vinculo = (respuesta: boolean, vistos: string[]): EscrituraDelVinculo => ({
  escribir: async (_ejecutar: EjecutorDelAlta, usuarioId: string) => {
    vistos.push(usuarioId);
    return respuesta;
  },
});

describe('CrearCuentaPorUsuario · con vínculo (15-W)', () => {
  it('el vínculo dice que no: VINCULO, sin cuenta en la base y sin identidad viva', async () => {
    const proveedor = new ProveedorQueRecuerda();
    const cuentas = new RepositorioDeCuentasEnMemoria();
    const vistos: string[] = [];
    const r = await new CrearCuentaPorUsuario(proveedor, cuentas).ejecutarConVinculo(
      solicitud,
      vinculo(false, vistos),
      'actor',
    );
    expect(r).toEqual({ ok: false, error: { motivo: 'VINCULO' } });
    expect(vistos).toHaveLength(1);
    expect(proveedor.vivas.size, 'quedó una identidad huérfana').toBe(0);
    expect(proveedor.eliminadas).toEqual(['auth-1']);
    expect(await cuentas.identidadDe(vistos[0] ?? '')).toBeNull();
  });

  it('el vínculo dice que sí: la cuenta queda, con el mismo usuario que vio el vínculo', async () => {
    const proveedor = new ProveedorQueRecuerda();
    const cuentas = new RepositorioDeCuentasEnMemoria();
    const vistos: string[] = [];
    const r = await new CrearCuentaPorUsuario(proveedor, cuentas).ejecutarConVinculo(
      solicitud,
      vinculo(true, vistos),
      'actor',
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(vistos).toEqual([r.valor.usuarioId]);
    expect(proveedor.vivas.has('auth-1')).toBe(true);
    expect(proveedor.eliminadas).toEqual([]);
    expect(cuentas.cambioPendiente(r.valor.usuarioId)).toBe(false);
  });

  it('sin vínculo, la base no puede negar uno: si lo hiciera, es un defecto y se dice', async () => {
    const proveedor = new ProveedorQueRecuerda();
    const cuentas = new RepositorioDeCuentasEnMemoria();
    const conTrampa = Object.assign(cuentas, {
      crearPorNombre: async () => ({ ok: false as const, motivo: 'VINCULO' as const }),
    });
    await expect(
      new CrearCuentaPorUsuario(proveedor, conTrampa).ejecutar(solicitud, 'actor'),
    ).rejects.toThrow('vínculo rechazado sin vínculo pedido');
  });

  it('el usuario ya existe: DUPLICADO antes de tocar el proveedor', async () => {
    const proveedor = new ProveedorQueRecuerda();
    const cuentas = new RepositorioDeCuentasEnMemoria();
    const crear = new CrearCuentaPorUsuario(proveedor, cuentas);
    expect((await crear.ejecutarConVinculo(solicitud, vinculo(true, []), 'actor')).ok).toBe(true);
    const otra = await crear.ejecutarConVinculo(solicitud, vinculo(true, []), 'actor');
    expect(otra).toEqual({ ok: false, error: { motivo: 'DUPLICADO' } });
    expect(proveedor.vivas.size).toBe(1);
  });
});
