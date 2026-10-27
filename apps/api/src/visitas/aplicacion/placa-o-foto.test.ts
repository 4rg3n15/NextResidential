import { describe, expect, it, vi } from 'vitest';
import { esFallo, exito } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { CrearAutorizacion, RevocarAutorizacion } from '../../autorizaciones';
import { aGenerada } from '../presentacion/respuestas';
import type { AvisoDeVisitas } from './aviso-de-visitas';
import { GenerarVisita, MENSAJE_PLACA_O_FOTO, revisarForma } from './generar-visita';
import type { EntradaDeVisita } from './generar-visita';
import type { PersonasDeVisita } from './puertos';
import type { FotoDeVisita, RegistrarRostroDeVisita, RostroRegistrado } from './rostro-de-visita';

/**
 * D-143 · decisión del cliente (pruebas en sitio, 23/10): una visita puede
 * llegar en carro sin registrar rostro. Placa o foto, AL MENOS UNA; la casilla
 * sólo con foto (RN-10). Sin foto la visita vale por placa y no se toca nada
 * biométrico: ni plantilla, ni consentimiento, ni equipos.
 */

const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-26T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-portero',
  rol: 'portero',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: true,
};
const como = <T>(o: object): T => o as unknown as T;

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 7),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');
const FOTO: FotoDeVisita = {
  contenidoBase64: JPEG,
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
};
const ROSTRO: RostroRegistrado = {
  plantillaId: 'p-1',
  consentimientoId: 'c-1',
  sincronizacion: null,
  avisoDeSincronizacion: null,
};

const montar = () => {
  const personas: PersonasDeVisita = { resolver: vi.fn(async () => 'persona-1') };
  const crear = { ejecutar: vi.fn(async () => exito({ id: 'a-1' })) };
  const revocar = { ejecutar: vi.fn(async () => exito(undefined)) };
  const aviso = { nueva: vi.fn(async () => 1) };
  const rostro = { ejecutar: vi.fn(async () => exito(ROSTRO)) };
  const caso = new GenerarVisita(
    personas,
    como<CrearAutorizacion>(crear),
    como<RevocarAutorizacion>(revocar),
    como<RegistrarRostroDeVisita>(rostro),
    como<AvisoDeVisitas>(aviso),
  );
  return { caso, personas, crear, revocar, aviso, rostro };
};

const entrada = (sobre: Partial<EntradaDeVisita>): EntradaDeVisita => ({
  visitante: { nombre: 'Ana', tipoDocumento: 'cedula', documento: '12345' },
  viviendaId: 'v-1',
  inicio: AHORA,
  duracionMinutos: 120,
  placa: null,
  observaciones: null,
  foto: null,
  casillaMarcada: false,
  ...sobre,
});

describe('D-143 · revisarForma: placa o foto, y la casilla sólo con foto', () => {
  const forma = (placa: string | null, conFoto: boolean, casillaMarcada: boolean) =>
    revisarForma({ casillaMarcada, duracionMinutos: 60, placa, conFoto });

  it('sin placa ni foto falla con el motivo que ve quien la genera', () => {
    const r = forma(null, false, true);
    expect(esFallo(r) && r.error.detalle).toBe(MENSAJE_PLACA_O_FOTO);
  });

  it('una placa en blanco es «sin placa»', () => {
    expect(esFallo(forma('   ', false, false))).toBe(true);
  });

  it('con placa y sin foto basta, con o sin casilla', () => {
    expect(esFallo(forma('ABC123', false, false))).toBe(false);
    expect(esFallo(forma('ABC123', false, true))).toBe(false);
  });

  it('con foto, la casilla sigue siendo obligatoria, haya placa o no', () => {
    expect(esFallo(forma(null, true, false))).toBe(true);
    expect(esFallo(forma('ABC123', true, false))).toBe(true);
    expect(esFallo(forma(null, true, true))).toBe(false);
  });
});

describe('D-143 · GenerarVisita desde la consola', () => {
  it('con placa y sin foto ni casilla: vigente por placa, sin plantilla, consentimiento ni equipos', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, entrada({ placa: 'ABC123' }));
    expect(r.ok && r.valor.generada).toBe(true);
    expect(m.crear.ejecutar).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ placa: 'ABC123', personaId: 'persona-1' }),
    );
    expect(m.rostro.ejecutar).not.toHaveBeenCalled();
    expect(m.revocar.ejecutar).not.toHaveBeenCalled();
    expect(m.aviso.nueva).toHaveBeenCalledWith(COP, 'a-1');
    if (r.ok && r.valor.generada) {
      expect(r.valor.plantillaId).toBeUndefined();
      expect(r.valor.consentimientoId).toBeUndefined();
      expect(r.valor.confirmacionDePlaca).toMatch(/ABC123/);
      // Y la respuesta HTTP no inventa equipos ni avisos.
      expect(aGenerada(r.valor)).toMatchObject({
        generada: true,
        equipos: 0,
        sincronizadas: 0,
        porEquipo: [],
        avisoDeSincronizacion: null,
      });
    }
  });

  it('con foto y sin placa, como hasta ahora: registra el rostro', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, entrada({ foto: FOTO, casillaMarcada: true }));
    expect(r.ok && r.valor.generada && r.valor.plantillaId).toBe('p-1');
    expect(m.rostro.ejecutar).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ autorizacionId: 'a-1', titularId: 'persona-1', foto: FOTO }),
    );
  });

  it('sin placa ni foto: 400 y no se crea NADA, ni la persona', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, entrada({ casillaMarcada: true }));
    expect(esFallo(r) && r.error.codigo).toBe('DATO_INVALIDO');
    expect(esFallo(r) && r.error.detalle).toBe(MENSAJE_PLACA_O_FOTO);
    expect(m.personas.resolver).not.toHaveBeenCalled();
    expect(m.crear.ejecutar).not.toHaveBeenCalled();
  });

  it('con foto y sin casilla se rechaza, aunque traiga placa', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, entrada({ placa: 'ABC123', foto: FOTO }));
    expect(esFallo(r) && r.error.detalle).toMatch(/autorizó el uso de su foto/);
    expect(m.crear.ejecutar).not.toHaveBeenCalled();
  });

  it('con foto que falla al registrarse, la autorización se sigue ANULANDO', async () => {
    const m = montar();
    m.rostro.ejecutar.mockImplementationOnce(async () => {
      throw new Error('almacén caído');
    });
    await expect(
      m.caso.ejecutar(ctx, entrada({ placa: 'ABC123', foto: FOTO, casillaMarcada: true })),
    ).rejects.toThrow('almacén caído');
    expect(m.revocar.ejecutar).toHaveBeenCalledWith(ctx, 'a-1', 'No se pudo guardar la foto');
  });
});
