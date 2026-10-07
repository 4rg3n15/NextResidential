import { describe, expect, it, vi } from 'vitest';
import { errorDominio } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { MiRostro } from './mi-rostro';
import type { FotoDeRostro } from './mi-rostro';
import { CAPTURAS_DE_ROSTRO_POR_DIA, POLITICA_DEL_ROSTRO } from './politica-del-rostro';
import type { HechoDeResidente } from './tipos-de-hecho';

/**
 * 15-X · D2 · la puerta de «Mi rostro», sin base: la persona sale del vínculo,
 * la política y la foto se juzgan antes de crear nada, el tope de 24 h da 429
 * con los segundos que faltan, y la bitácora no lleva bytes.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-08T12:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'cuenta-1',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(32, 7),
  Buffer.from([0xff, 0xd9]),
]).toString('base64');
const foto = (p: Partial<FotoDeRostro> = {}): FotoDeRostro => ({
  contenidoBase64: JPEG,
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
  versionPolitica: POLITICA_DEL_ROSTRO.version,
  ...p,
});

const montar = (capturas: readonly Date[] = []) => {
  const hechos: HechoDeResidente[] = [];
  const rostro = {
    registrar: vi.fn(async () => ({
      ok: true as const,
      valor: { registrado: true as const, plantillaId: 'pl-1', reemplazada: null },
    })),
    retirar: vi.fn(async () => ({ ok: true as const, valor: true })),
    leer: vi.fn(async () => ({ plantilla: null, equipos: [], retiradasPendientes: 0 })),
    capturasRecientes: vi.fn(async () => capturas),
  };
  const mi = new MiRostro(
    {
      ejecutar: async () => ({
        ok: true,
        valor: {
          ambito: { copropiedadId: COP, viviendaId: 'v-1' },
          vinculo: { personaId: 'persona-del-vinculo' },
        },
      }),
    } as never,
    rostro,
    { anotar: async (h: HechoDeResidente) => void hechos.push(h) },
    { ahora: () => AHORA },
    365,
  );
  return { mi, rostro, hechos };
};

describe('15-X · D2 · MiRostro', () => {
  it('la persona sale del VÍNCULO de la cuenta, y la supresión a 365 días', async () => {
    const { mi, rostro } = montar();
    const r = await mi.registrar(ctx, COP, foto());
    expect(r.ok && r.valor.hecho).toBe(true);
    expect(rostro.registrar).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        titularId: 'persona-del-vinculo',
        suprimirEn: new Date(AHORA.getTime() + 365 * 86_400_000),
      }),
    );
  });

  it('la bitácora anota la versión de la política, nunca bytes', async () => {
    const { mi, hechos } = montar();
    await mi.registrar(ctx, COP, foto());
    expect(hechos).toEqual([
      expect.objectContaining({
        tipo: 'rostro_registrado',
        detalle: `politica:${POLITICA_DEL_ROSTRO.version}`,
      }),
    ]);
    expect(JSON.stringify(hechos)).not.toContain(JPEG.slice(0, 16));
  });

  it('una política que no es la vigente: 409 antes de mirar la foto', async () => {
    const { mi, rostro } = montar();
    const r = await mi.registrar(ctx, COP, foto({ versionPolitica: 'vieja' }));
    expect(r.ok && !r.valor.hecho && r.valor.estado).toBe(409);
    expect(rostro.registrar).not.toHaveBeenCalled();
  });

  it('un archivo que no es la imagen que dice ser: 400, sin crear nada', async () => {
    const { mi, rostro } = montar();
    const r = await mi.registrar(ctx, COP, foto({ tipoMime: 'image/png' }));
    expect(r.ok && !r.valor.hecho && r.valor.estado).toBe(400);
    expect(rostro.registrar).not.toHaveBeenCalled();
  });

  it('una foto con dos rostros: 400 con los motivos', async () => {
    const { mi } = montar();
    const r = await mi.registrar(
      ctx,
      COP,
      foto({
        medidas: { rostrosDetectados: 2, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
      }),
    );
    expect(r.ok && !r.valor.hecho && r.valor.motivos?.length).toBeGreaterThan(0);
  });

  it(`con ${String(CAPTURAS_DE_ROSTRO_POR_DIA)} capturas en 24 h: 429 y cuántos segundos faltan`, async () => {
    const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);
    const { mi, rostro } = montar([hace(23), hace(10), hace(5), hace(2), hace(1)]);
    const r = await mi.registrar(ctx, COP, foto());
    expect(r.ok && !r.valor.hecho && r.valor.estado).toBe(429);
    expect(r.ok && !r.valor.hecho && r.valor.reintentarEnS).toBe(3600);
    expect(rostro.registrar).not.toHaveBeenCalled();
  });

  it('con 6 (dos a la vez pasaron el tope): el hueco llega cuando caduca la SEGUNDA más antigua', async () => {
    const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000);
    const { mi } = montar([hace(23), hace(22), hace(10), hace(5), hace(2), hace(1)]);
    const r = await mi.registrar(ctx, COP, foto());
    expect(r.ok && !r.valor.hecho && r.valor.reintentarEnS).toBe(2 * 3600);
  });

  it('otro registro ganó: 409; un error de forma de la biometría: 400', async () => {
    const { mi, rostro } = montar();
    rostro.registrar.mockResolvedValueOnce({
      ok: true,
      valor: { registrado: false, enConflicto: true },
    } as never);
    expect(await mi.registrar(ctx, COP, foto())).toMatchObject({ valor: { estado: 409 } });
    rostro.registrar.mockResolvedValueOnce({
      ok: false,
      error: errorDominio('DATO_INVALIDO', 'Faltan las medidas'),
    } as never);
    expect(await mi.registrar(ctx, COP, foto())).toMatchObject({ valor: { estado: 400 } });
  });

  it('retirar sin nada que retirar: 404; con rostro: lo anota', async () => {
    const { mi, rostro, hechos } = montar();
    rostro.retirar.mockResolvedValueOnce({ ok: true, valor: false });
    expect(await mi.retirar(ctx, COP)).toMatchObject({ valor: { estado: 404 } });
    expect(await mi.retirar(ctx, COP)).toMatchObject({ valor: { hecho: true } });
    expect(hechos.map((h) => h.tipo)).toEqual(['rostro_retirado']);
  });

  it('el estado lleva la política vigente', async () => {
    const { mi } = montar();
    const r = await mi.estado(ctx, COP);
    expect(r.ok && r.valor).toMatchObject({ estado: 'sin_rostro', politica: POLITICA_DEL_ROSTRO });
  });
});
