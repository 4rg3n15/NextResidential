import { describe, expect, it, vi } from 'vitest';
import { esFallo, exito } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RevocarAutorizacion } from '../../autorizaciones';
import { MENSAJE_PLACA_O_FOTO } from '../../visitas';
import type { AvisoDeVisitas, RegistrarRostroDeVisita } from '../../visitas';
import type { ResolverMiAmbito } from './casos-de-uso';
import type { CrearMiAutorizacion } from './crear-mi-autorizacion';
import { GenerarMiVisita } from './mis-visitas';
import type { EntradaDeMiVisita } from './mis-visitas';
import type { AutorizacionesDelResidente } from './puertos';

/**
 * D-143 · el residente también elige: placa o foto, al menos una. La regla es
 * la MISMA `revisarForma` de la consola; aquí se comprueba que el camino del
 * residente no toca nada biométrico cuando la visita viene sólo con placa.
 */

const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-26T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-residente',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};
const como = <T>(o: object): T => o as unknown as T;

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 7),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');
const FOTO = {
  contenidoBase64: JPEG,
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
};

const montar = () => {
  const resolver = {
    ejecutar: vi.fn(async () =>
      exito({ ambito: { copropiedadId: COP, viviendaId: 'v-1' }, vinculo: {} }),
    ),
  };
  const crear = {
    ejecutar: vi.fn(async () => exito({ creada: true, id: 'a-1', repetida: false })),
  };
  const autorizaciones = {
    titularDeLaAutorizacion: vi.fn(async () => ({ personaId: 'persona-1', nombre: 'Ana' })),
  };
  const rostro = {
    ejecutar: vi.fn(async () =>
      exito({
        plantillaId: 'p-1',
        consentimientoId: 'c-1',
        sincronizacion: null,
        avisoDeSincronizacion: null,
      }),
    ),
  };
  const revocar = { ejecutar: vi.fn(async () => exito(undefined)) };
  const aviso = { nueva: vi.fn(async () => 1) };
  const caso = new GenerarMiVisita(
    como<ResolverMiAmbito>(resolver),
    como<CrearMiAutorizacion>(crear),
    como<AutorizacionesDelResidente>(autorizaciones),
    como<RegistrarRostroDeVisita>(rostro),
    como<RevocarAutorizacion>(revocar),
    como<AvisoDeVisitas>(aviso),
  );
  return { caso, resolver, crear, autorizaciones, rostro, revocar, aviso };
};

const entrada = (sobre: Partial<EntradaDeMiVisita>): EntradaDeMiVisita => ({
  nombre: 'Ana',
  documento: '12345',
  inicio: AHORA,
  duracionMinutos: 120,
  placa: null,
  observaciones: null,
  foto: null,
  casillaMarcada: false,
  claveDeIdempotencia: 'clave-1',
  ...sobre,
});

describe('D-143 · GenerarMiVisita: placa o foto', () => {
  it('con placa y sin foto ni casilla: creada, con acceso vehicular y sin nada biométrico', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, COP, entrada({ placa: 'ABC123' }));
    expect(r.ok && r.valor).toEqual({ creada: true, id: 'a-1', repetida: false });
    expect(m.crear.ejecutar).toHaveBeenCalledWith(
      ctx,
      COP,
      expect.objectContaining({ placa: 'ABC123', permiteAccesoVehicular: true }),
    );
    expect(m.autorizaciones.titularDeLaAutorizacion).not.toHaveBeenCalled();
    expect(m.rostro.ejecutar).not.toHaveBeenCalled();
    expect(m.revocar.ejecutar).not.toHaveBeenCalled();
    expect(m.aviso.nueva).toHaveBeenCalledWith(COP, 'a-1');
  });

  it('con foto y sin placa, como hasta ahora: registra el rostro', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, COP, entrada({ foto: FOTO, casillaMarcada: true }));
    expect(r.ok && r.valor).toMatchObject({ creada: true, plantillaId: 'p-1' });
    expect(m.crear.ejecutar).toHaveBeenCalledWith(
      ctx,
      COP,
      expect.objectContaining({ permiteAccesoVehicular: false }),
    );
    expect(m.rostro.ejecutar).toHaveBeenCalledTimes(1);
  });

  it('sin placa ni foto: 400 con el motivo, sin resolver ni crear nada', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, COP, entrada({ casillaMarcada: true }));
    expect(esFallo(r) && r.error.detalle).toBe(MENSAJE_PLACA_O_FOTO);
    expect(m.resolver.ejecutar).not.toHaveBeenCalled();
    expect(m.crear.ejecutar).not.toHaveBeenCalled();
  });

  it('con foto y sin casilla se rechaza, aunque traiga placa', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, COP, entrada({ placa: 'ABC123', foto: FOTO }));
    expect(esFallo(r)).toBe(true);
    expect(m.crear.ejecutar).not.toHaveBeenCalled();
  });
});
