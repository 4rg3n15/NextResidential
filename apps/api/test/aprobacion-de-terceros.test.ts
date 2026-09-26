import { describe, expect, it } from 'vitest';
import { aprobacionDelPortero, esVehiculoDeTercero } from '@ncr/domain-core';
import type { ContextoTenant } from '../src/autenticacion';
import { ResolverMiAmbito } from '../src/residente/aplicacion/casos-de-uso';
import { CrearMiAutorizacion } from '../src/residente/aplicacion/crear-mi-autorizacion';
import type { EntradaDeNuevaVisita } from '../src/residente/aplicacion/crear-mi-autorizacion';
import { COP_A } from './constantes';
import {
  AutorizacionesDelResidenteEnMemoria,
  DirectorioDelResidenteEnMemoria,
  USUARIO_R1,
} from './dobles/directorio-del-residente';

/**
 * D5 b/c · ADR-027 · la autorización del RESIDENTE (la de la app) también pasa
 * por la política de aprobación. Hoy es la automática: un tercero con placa nace
 * activo y sin límite de cantidad. Con la del portero —que el dominio ya tiene y
 * la base todavía no puede guardar— la creación falla cerrada y no escribe.
 */
const AHORA = new Date('2026-09-26T12:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: USUARIO_R1,
  rol: 'residente',
  copropiedadId: COP_A,
  copropiedadesAtendidas: [],
  mfaVerificado: false,
};
const visita = (n: number): EntradaDeNuevaVisita => ({
  visitante: `Tercero ${String(n)}`,
  documento: null,
  desde: '2026-09-27T13:00:00Z',
  hasta: '2026-09-27T17:00:00Z',
  placa: `TER${String(100 + n)}`,
  permiteAccesoVehicular: true,
  acompanantes: [],
  zonasPermitidas: [],
  observaciones: null,
  patron: null,
  claveDeIdempotencia: `aprobacion-${String(n)}`,
});

const montar = (conPortero: boolean) => {
  const escrituras = new AutorizacionesDelResidenteEnMemoria();
  const caso = new CrearMiAutorizacion(
    new ResolverMiAmbito(new DirectorioDelResidenteEnMemoria()),
    escrituras,
    { ahora: () => AHORA },
    ...(conPortero ? [aprobacionDelPortero(esVehiculoDeTercero)] : []),
  );
  return { caso, escrituras };
};

describe('ADR-027 · la aprobación de la app pasa por la política', () => {
  it('automática: cinco terceros con placa, cinco aceptados (sin límite, D5 b)', async () => {
    const { caso, escrituras } = montar(false);
    for (let n = 1; n <= 5; n += 1) {
      const r = await caso.ejecutar(ctx, COP_A, visita(n));
      expect(r.ok && r.valor.creada, JSON.stringify(r)).toBe(true);
    }
    const total = [...escrituras.creadas.values()].reduce((s, l) => s + l.length, 0);
    expect(total).toBe(5);
  });

  it('con la del portero: falla cerrada y NO escribe nada', async () => {
    const { caso, escrituras } = montar(true);
    const r = await caso.ejecutar(ctx, COP_A, visita(9));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.codigo).toBe('OPERACION_NO_PERMITIDA');
    expect(escrituras.creadas.size).toBe(0);
  });
});
