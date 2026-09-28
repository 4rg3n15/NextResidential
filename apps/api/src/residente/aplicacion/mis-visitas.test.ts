import { describe, expect, it, vi } from 'vitest';
import { errorDominio, esFallo, exito, fallo } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { RevocarAutorizacion } from '../../autorizaciones';
import type {
  AvisoDeVisitas,
  DatosParaVolverAAutorizar,
  RegistrarRostroDeVisita,
  UltimosVisitantes,
} from '../../visitas';
import type { ResolverMiAmbito } from './casos-de-uso';
import type { CrearMiAutorizacion } from './crear-mi-autorizacion';
import { GenerarMiVisita, MisUltimosVisitantes, VolverAAutorizar } from './mis-visitas';
import type { EntradaDeMiVisita } from './mis-visitas';
import type { AutorizacionesDelResidente } from './puertos';

/**
 * F1 y F6 (15-L) · las visitas del residente, SIN base: el orden de las
 * comprobaciones, el reintento que no duplica la foto, la compensación cuando
 * la foto no se registra y «Volver a autorizar». De punta a punta, contra
 * PostgreSQL, lo prueba `test/visitas-pg.test.ts`.
 */

const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-09-27T15:00:00Z');
const AMBITO = { ambito: { copropiedadId: COP, viviendaId: 'v-1' }, vinculo: {} };

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
const MEDIDAS = { rostrosDetectados: 1, nitidez: 0.9, iluminacion: 0.6, proporcionRostro: 0.4 };

const ENTRADA: EntradaDeMiVisita = {
  nombre: 'Ana',
  documento: '12345',
  inicio: AHORA,
  duracionMinutos: 120,
  placa: 'ABC123',
  observaciones: null,
  foto: { contenidoBase64: JPEG, tipoMime: 'image/jpeg', medidas: MEDIDAS },
  casillaMarcada: true,
  claveDeIdempotencia: 'clave-1',
};

const montar = () => {
  const resolver = { ejecutar: vi.fn(async () => exito(AMBITO)) };
  const crear = {
    ejecutar: vi.fn(async () => exito({ creada: true, id: 'a-1', repetida: false })),
  };
  const autorizaciones = {
    titularDeLaAutorizacion: vi.fn(
      async (): Promise<{ readonly personaId: string; readonly nombre: string } | null> => ({
        personaId: 'persona-1',
        nombre: 'Ana',
      }),
    ),
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

describe('GenerarMiVisita · F1 desde la app', () => {
  it('crea la visita de SU vivienda, con la placa como acceso vehicular, y avisa en vivo', async () => {
    const m = montar();
    const r = await m.caso.ejecutar(ctx, COP, ENTRADA);
    expect(r.ok && r.valor).toMatchObject({
      creada: true,
      id: 'a-1',
      repetida: false,
      plantillaId: 'p-1',
    });
    expect(m.crear.ejecutar).toHaveBeenCalledWith(
      ctx,
      COP,
      expect.objectContaining({
        visitante: 'Ana',
        permiteAccesoVehicular: true,
        claveDeIdempotencia: 'clave-1',
      }),
    );
    expect(m.rostro.ejecutar).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ autorizacionId: 'a-1', titularId: 'persona-1' }),
    );
    expect(m.aviso.nueva).toHaveBeenCalledWith(COP, 'a-1');
  });

  it('sin casilla, con una foto inválida o de mala calidad, no se crea nada', async () => {
    const m = montar();
    expect(esFallo(await m.caso.ejecutar(ctx, COP, { ...ENTRADA, casillaMarcada: false }))).toBe(
      true,
    );
    expect(
      esFallo(
        await m.caso.ejecutar(ctx, COP, {
          ...ENTRADA,
          foto: { ...ENTRADA.foto, tipoMime: 'image/gif' },
        }),
      ),
    ).toBe(true);
    const mala = await m.caso.ejecutar(ctx, COP, {
      ...ENTRADA,
      foto: { ...ENTRADA.foto, medidas: { ...MEDIDAS, rostrosDetectados: 0 } },
    });
    expect(mala.ok && !mala.valor.creada && 'motivosDeFoto' in mala.valor).toBe(true);
    expect(m.resolver.ejecutar).not.toHaveBeenCalled();
    expect(m.crear.ejecutar).not.toHaveBeenCalled();
  });

  it('sin vínculo, o si la regla de negocio no deja autorizar, se dice y no hay foto', async () => {
    const m = montar();
    m.resolver.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('OPERACION_NO_PERMITIDA', 'sin vínculo'))),
    );
    expect(esFallo(await m.caso.ejecutar(ctx, COP, ENTRADA))).toBe(true);

    m.crear.ejecutar.mockResolvedValueOnce(como(fallo(errorDominio('DATO_INVALIDO', 'placa'))));
    expect(esFallo(await m.caso.ejecutar(ctx, COP, ENTRADA))).toBe(true);

    m.crear.ejecutar.mockResolvedValueOnce(como(exito({ creada: false, motivo: 'LISTA_NEGRA' })));
    const r = await m.caso.ejecutar(ctx, COP, ENTRADA);
    expect(r.ok && r.valor).toEqual({ creada: false, motivo: 'LISTA_NEGRA' });
    expect(m.rostro.ejecutar).not.toHaveBeenCalled();
  });

  it('un reintento que ya llegó no vuelve a subir la foto (RN-17)', async () => {
    const m = montar();
    m.crear.ejecutar.mockResolvedValueOnce(
      como(exito({ creada: true, id: 'a-1', repetida: true })),
    );
    const r = await m.caso.ejecutar(ctx, COP, ENTRADA);
    expect(r.ok && r.valor).toEqual({ creada: true, id: 'a-1', repetida: true });
    expect(m.rostro.ejecutar).not.toHaveBeenCalled();
    expect(m.aviso.nueva).not.toHaveBeenCalled();
  });

  it('sin titular no hay foto; si la foto no se registra o lanza, la visita se anula', async () => {
    const m = montar();
    m.autorizaciones.titularDeLaAutorizacion.mockResolvedValueOnce(null);
    expect(esFallo(await m.caso.ejecutar(ctx, COP, ENTRADA))).toBe(true);

    m.rostro.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('DATO_INVALIDO', 'almacén lleno'))),
    );
    expect(esFallo(await m.caso.ejecutar(ctx, COP, ENTRADA))).toBe(true);
    expect(m.revocar.ejecutar).toHaveBeenLastCalledWith(
      ctx,
      'a-1',
      'No se registró la foto: almacén lleno',
    );

    m.rostro.ejecutar.mockRejectedValueOnce(new Error('almacén caído'));
    await expect(m.caso.ejecutar(ctx, COP, ENTRADA)).rejects.toThrow('almacén caído');
    expect(m.revocar.ejecutar).toHaveBeenLastCalledWith(ctx, 'a-1', 'No se pudo guardar la foto');
    expect(m.aviso.nueva).not.toHaveBeenCalled();
  });
});

describe('VolverAAutorizar · F6', () => {
  const montarRepeticion = (datos: object) => {
    const m = montar();
    const anterior = { ejecutar: vi.fn(async () => exito(datos)) };
    const caso = new VolverAAutorizar(
      como<ResolverMiAmbito>(m.resolver),
      como<DatosParaVolverAAutorizar>(anterior),
      m.caso,
    );
    return { ...m, caso, anterior, generar: m.caso };
  };
  const PETICION = {
    autorizacionId: 'a-0',
    inicio: AHORA,
    duracionMinutos: 60,
    casillaMarcada: true,
    claveDeIdempotencia: 'clave-2',
  };
  const DATOS = {
    visitante: 'Ana',
    documento: '12345',
    placa: null,
    calidad: 88,
    foto: { contenidoBase64: JPEG, tipoMime: 'image/jpeg' },
  };

  it('copia datos y foto, con la calidad medida entonces, y sólo pide cuándo y cuánto', async () => {
    const m = montarRepeticion(DATOS);
    const r = await m.caso.ejecutar(ctx, COP, PETICION);
    expect(r.ok && r.valor.creada).toBe(true);
    expect(m.anterior.ejecutar).toHaveBeenCalledWith(COP, 'v-1', 'a-0');
    expect(m.crear.ejecutar).toHaveBeenCalledWith(
      ctx,
      COP,
      expect.objectContaining({
        visitante: 'Ana',
        documento: '12345',
        permiteAccesoVehicular: false,
      }),
    );
  });

  it('una visita sin foto guardada no se puede repetir; ni una de otra vivienda', async () => {
    expect(
      esFallo(await montarRepeticion({ ...DATOS, foto: null }).caso.ejecutar(ctx, COP, PETICION)),
    ).toBe(true);
    expect(
      esFallo(
        await montarRepeticion({ ...DATOS, calidad: null }).caso.ejecutar(ctx, COP, PETICION),
      ),
    ).toBe(true);
    const ajena = montarRepeticion(DATOS);
    ajena.anterior.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Esa visita no es de su vivienda'))),
    );
    expect(esFallo(await ajena.caso.ejecutar(ctx, COP, PETICION))).toBe(true);
    const sinVinculo = montarRepeticion(DATOS);
    sinVinculo.resolver.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('OPERACION_NO_PERMITIDA', 'sin vínculo'))),
    );
    expect(esFallo(await sinVinculo.caso.ejecutar(ctx, COP, PETICION))).toBe(true);
  });
});

describe('MisUltimosVisitantes · F6', () => {
  it('lee los de SU vivienda, la que sale de su vínculo', async () => {
    const m = montar();
    const ultimos = { ejecutar: vi.fn(async () => []) };
    const caso = new MisUltimosVisitantes(
      como<ResolverMiAmbito>(m.resolver),
      como<UltimosVisitantes>(ultimos),
    );
    expect((await caso.ejecutar(ctx, COP)).ok).toBe(true);
    expect(ultimos.ejecutar).toHaveBeenCalledWith(COP, 'v-1');

    m.resolver.ejecutar.mockResolvedValueOnce(
      como(fallo(errorDominio('OPERACION_NO_PERMITIDA', 'sin vínculo'))),
    );
    expect(esFallo(await caso.ejecutar(ctx, COP))).toBe(true);
  });
});
