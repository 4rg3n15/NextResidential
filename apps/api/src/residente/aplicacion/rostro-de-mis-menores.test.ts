import { describe, expect, it, vi } from 'vitest';
import { errorDominio } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import { CAPTURAS_DE_ROSTRO_POR_DIA, POLITICA_DEL_ROSTRO_DE_MENOR } from './politica-del-rostro';
import type { FotoDeRostro } from './puerta-del-rostro';
import { RostroDeMisMenores } from './rostro-de-mis-menores';
import type { MenorParaElRostro } from './rostro-de-mis-menores';
import type { HechoDeResidente } from './tipos-de-hecho';

/**
 * 15-X · D3 · la puerta del rostro de un menor, sin base: sólo el titular del
 * hogar (403), sólo un menor de SU vivienda (404), sólo de 15 a 17 años (400
 * con su código), la misma política propia del representante, el mismo tope de
 * la cuenta, y la supresión al año o a los 18, lo que llegue antes.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-08T17:00:00Z'); // 12:00 del 8 de octubre en Bogotá
const DIA = 86_400_000;
const ctx: ContextoTenant = {
  usuarioId: 'cuenta-titular',
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
const foto = (p: Partial<FotoDeRostro> = {}) => ({
  contenidoBase64: JPEG,
  tipoMime: 'image/jpeg',
  medidas: { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 },
  versionPolitica: POLITICA_DEL_ROSTRO_DE_MENOR.version,
  declaraRepresentacionLegal: true as const,
  menorInformadoYDeAcuerdo: true as const,
  ...p,
});

const montar = (
  o: {
    titular?: boolean;
    menor?: MenorParaElRostro | null;
    capturas?: readonly Date[];
    habia?: boolean;
  } = {},
) => {
  const hechos: HechoDeResidente[] = [];
  const rostro = {
    registrar: vi.fn(async () => ({
      ok: true as const,
      valor: { registrado: true as const, plantillaId: 'pl-1', reemplazada: null },
    })),
    retirar: vi.fn(async () => ({ ok: true as const, valor: o.habia ?? true })),
    leer: vi.fn(async () => ({ plantilla: null, equipos: [], retiradasPendientes: 0 })),
    capturasRecientes: vi.fn(async () => o.capturas ?? []),
  };
  const menores = {
    delHogar: vi.fn(async () =>
      o.menor === undefined
        ? { personaId: 'persona-menor', fechaNacimiento: '2010-03-15' }
        : o.menor,
    ),
  };
  const ocupantes = {
    declaracion: vi.fn(async () => ({
      esPrimerResidente: o.titular ?? true,
      declarada: true,
      tope: 4,
      codigoCorto: 'MIRA',
    })),
  };
  const caso = new RostroDeMisMenores(
    {
      ejecutar: async () => ({
        ok: true,
        valor: { ambito: { copropiedadId: COP, viviendaId: 'v-1' }, vinculo: {} },
      }),
    } as never,
    ocupantes as never,
    menores,
    rostro,
    { anotar: async (h: HechoDeResidente) => void hechos.push(h) },
    { ahora: () => AHORA },
    365,
  );
  return { caso, rostro, menores, ocupantes, hechos };
};

const rechazo = (r: Awaited<ReturnType<RostroDeMisMenores['registrar']>>) =>
  r.ok && !r.valor.hecho ? r.valor : null;

describe('15-X · D3 · RostroDeMisMenores · quién y a quién', () => {
  it('otro adulto del hogar: 403, sin buscar al menor ni tocar la biometría', async () => {
    const { caso, menores, rostro } = montar({ titular: false });
    for (const r of [
      await caso.registrar(ctx, COP, 'r-1', foto()),
      await caso.retirar(ctx, COP, 'r-1'),
    ]) {
      expect(rechazo(r)?.estado).toBe(403);
    }
    const e = await caso.estado(ctx, COP, 'r-1');
    expect(e.ok && !e.valor.hecho && e.valor.estado).toBe(403);
    expect(menores.delHogar).not.toHaveBeenCalled();
    expect(rostro.registrar).not.toHaveBeenCalled();
    expect(rostro.retirar).not.toHaveBeenCalled();
  });

  it('un residente que no es un menor de SU vivienda: 404, buscado con la vivienda del ámbito', async () => {
    const { caso, menores, rostro } = montar({ menor: null });
    expect(rechazo(await caso.registrar(ctx, COP, 'r-ajeno', foto()))?.estado).toBe(404);
    expect(menores.delHogar).toHaveBeenCalledWith(COP, 'v-1', 'r-ajeno');
    expect(rostro.registrar).not.toHaveBeenCalled();
  });

  it('un fallo del ámbito sube tal cual', async () => {
    const { caso } = montar();
    const sinAmbito = new RostroDeMisMenores(
      {
        ejecutar: async () => ({ ok: false, error: errorDominio('OPERACION_NO_PERMITIDA', 'x') }),
      } as never,
      { declaracion: vi.fn() } as never,
      { delHogar: vi.fn() },
      caso as never,
      { anotar: vi.fn() },
      { ahora: () => AHORA },
      365,
    );
    expect((await sinAmbito.registrar(ctx, COP, 'r-1', foto())).ok).toBe(false);
  });
});

describe('15-X · D3 · RostroDeMisMenores · la edad (S-15W-01)', () => {
  it.each([
    ['2011-10-09', 'EDAD_INSUFICIENTE'], // cumple 15 mañana
    ['2008-10-08', 'YA_ES_MAYOR'], // cumple 18 hoy
    [null, 'SIN_FECHA'],
  ])('nacido %s: 400 %s, y nada se registra', async (fecha, codigo) => {
    const { caso, rostro } = montar({ menor: { personaId: 'p', fechaNacimiento: fecha } });
    const r = rechazo(await caso.registrar(ctx, COP, 'r-1', foto()));
    expect(r).toMatchObject({ estado: 400, codigo });
    expect(rostro.registrar).not.toHaveBeenCalled();
  });

  it('15 cumplidos hoy sí; vence a los 365 días si cumple 18 después', async () => {
    const { caso, rostro } = montar({ menor: { personaId: 'p', fechaNacimiento: '2011-10-08' } });
    expect((await caso.registrar(ctx, COP, 'r-1', foto())).ok).toBe(true);
    expect(rostro.registrar).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        titularId: 'p',
        representanteId: 'cuenta-titular',
        suprimirEn: new Date(AHORA.getTime() + 365 * DIA),
      }),
    );
  });

  it('con 17 y los 18 antes del año: vence al cumplirlos, a las 00:00 de Bogotá', async () => {
    const { caso, rostro } = montar({ menor: { personaId: 'p', fechaNacimiento: '2009-01-20' } });
    await caso.registrar(ctx, COP, 'r-1', foto());
    expect(rostro.registrar).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ suprimirEn: new Date('2027-01-20T05:00:00.000Z') }),
    );
  });
});

describe('15-X · D3 · RostroDeMisMenores · la puerta, el registro y el retiro', () => {
  it('la política es la del representante: con la de «Mi rostro», 409', async () => {
    const { caso, rostro } = montar();
    const r = rechazo(await caso.registrar(ctx, COP, 'r-1', foto({ versionPolitica: 'otra' })));
    expect(r?.estado).toBe(409);
    expect(rostro.registrar).not.toHaveBeenCalled();
  });

  it('el tope de 24 h es de la CUENTA del titular: 429 con los segundos que faltan', async () => {
    const capturas = Array.from(
      { length: CAPTURAS_DE_ROSTRO_POR_DIA },
      (_, i) => new Date(AHORA.getTime() - (20 - i) * 3_600_000),
    );
    const { caso, rostro } = montar({ capturas });
    const r = rechazo(await caso.registrar(ctx, COP, 'r-1', foto()));
    expect(r).toMatchObject({ estado: 429, reintentarEnS: 4 * 3600 });
    expect(rostro.capturasRecientes).toHaveBeenCalledWith(COP, 'cuenta-titular', AHORA);
  });

  it('registra y anota el hecho con el residente y la versión; ni bytes ni documento', async () => {
    const { caso, hechos } = montar();
    const r = await caso.registrar(ctx, COP, 'r-1', foto());
    expect(r.ok && r.valor.hecho).toBe(true);
    expect(hechos).toEqual([
      expect.objectContaining({
        tipo: 'rostro_de_menor_registrado',
        viviendaId: 'v-1',
        detalle: `residente:r-1 politica:${POLITICA_DEL_ROSTRO_DE_MENOR.version}`,
      }),
    ]);
    expect(JSON.stringify(hechos)).not.toContain(JPEG.slice(0, 16));
  });

  it('lo que la biometría rechaza: 409 con su texto, o 400 con los motivos de la foto', async () => {
    const { caso, rostro } = montar();
    rostro.registrar.mockResolvedValueOnce({
      ok: false,
      error: errorDominio('INVARIANTE_VIOLADA', 'lo autorizó otro representante'),
    } as never);
    expect(rechazo(await caso.registrar(ctx, COP, 'r-1', foto()))).toMatchObject({
      estado: 409,
      explicacion: 'lo autorizó otro representante',
    });
    rostro.registrar.mockResolvedValueOnce({
      ok: true,
      valor: { registrado: false, motivos: ['SIN_ROSTRO'] },
    } as never);
    expect(rechazo(await caso.registrar(ctx, COP, 'r-1', foto()))).toMatchObject({
      estado: 400,
      motivos: ['SIN_ROSTRO'],
    });
    rostro.registrar.mockResolvedValueOnce({
      ok: true,
      valor: { registrado: false, enConflicto: true },
    } as never);
    expect(rechazo(await caso.registrar(ctx, COP, 'r-1', foto()))?.estado).toBe(409);
  });

  it('retira como representante, con su cuenta; sin nada que retirar, 404', async () => {
    const { caso, rostro, hechos } = montar();
    expect((await caso.retirar(ctx, COP, 'r-1')).ok).toBe(true);
    expect(rostro.retirar).toHaveBeenCalledWith(ctx, 'persona-menor', 'cuenta-titular');
    expect(hechos[0]).toMatchObject({ tipo: 'rostro_de_menor_retirado', detalle: 'residente:r-1' });
    const vacio = montar({ habia: false });
    const r = await vacio.caso.retirar(ctx, COP, 'r-1');
    expect(r.ok && !r.valor.hecho && r.valor.estado).toBe(404);
    expect(vacio.hechos).toEqual([]);
  });

  it('el estado lleva la política del representante y nunca la imagen', async () => {
    const { caso } = montar();
    const e = await caso.estado(ctx, COP, 'r-1');
    expect(e.ok && e.valor.hecho && e.valor.estado.politica).toEqual(POLITICA_DEL_ROSTRO_DE_MENOR);
    expect(JSON.stringify(e)).not.toMatch(/vector|contenidoBase64/);
  });
});
