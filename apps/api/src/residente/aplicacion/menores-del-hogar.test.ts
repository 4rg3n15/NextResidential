import { describe, expect, it, vi } from 'vitest';
import { errorDominio, exito, fallo } from '@ncr/domain-core';
import type { ErrorDominio, Resultado } from '@ncr/domain-core';
import type { ContextoTenant } from '../../autenticacion';
import type { SuprimirPlantillasDeTitular } from '../../biometria';
import type { ResolverMiAmbito } from './casos-de-uso';
import { MenoresDeMiHogar } from './menores-del-hogar';
import type { MenorEscrito, MenoresDelHogar } from './puertos-de-menores';
import type { CodigosDeOcupante, OcupantesDeLaVivienda } from './puertos-hogar';

/**
 * 15-W · D4 · los menores del hogar SIN base: la edad con el reloj fijo y el
 * día de Bogotá, el documento enmascarado, la traducción de cada «no» de la
 * base y el código de traspaso. Contra PostgreSQL: `menores-del-hogar-pg`.
 */
const COP = '10000000-0000-4000-8000-000000000001';
// 15:00 UTC = 10:00 en Bogotá: el mismo día civil en las dos.
const AHORA = new Date('2026-10-06T15:00:00Z');
const ctx: ContextoTenant = {
  usuarioId: 'u-adulto',
  rol: 'residente',
  copropiedadId: COP,
  copropiedadesAtendidas: [COP],
  mfaVerificado: false,
};
const como = <T>(o: object): T => o as unknown as T;
const ALTA = {
  nombres: 'Sofía',
  apellidos: 'Pérez',
  fechaNacimiento: '2015-08-21',
  parentesco: 'Hija',
  tipoDocumento: 'tarjeta_identidad',
  numeroDocumento: ' 1.012-345 678 ',
  plazaId: 'plaza-2',
};

const montar = (o: { escrito?: MenorEscrito; titular?: boolean; plaza?: object | null } = {}) => {
  const escrito: MenorEscrito = o.escrito ?? { ok: true, residenteId: 'r-1', personaId: 'p-1' };
  const resolver = {
    ejecutar: vi.fn(
      async (): Promise<Resultado<object, ErrorDominio>> =>
        exito({ ambito: { copropiedadId: COP, viviendaId: 'v-1' }, vinculo: {} }),
    ),
  };
  const menores = {
    listar: vi.fn(async () => [
      {
        residenteId: 'r-1',
        nombres: 'Sofía',
        apellidos: 'Pérez',
        nombreCompleto: 'Sofía Pérez',
        fechaNacimiento: '2015-08-21',
        tipoDocumento: 'tarjeta_identidad',
        numeroDocumento: '1012345678',
        parentesco: 'Hija',
        plazaId: 'plaza-2',
        plazaNumero: 2,
        tieneRostro: false,
      },
      {
        residenteId: 'r-2',
        nombres: null,
        apellidos: null,
        nombreCompleto: 'Sin fecha',
        fechaNacimiento: null,
        tipoDocumento: 'registro_civil',
        numeroDocumento: '99887766',
        parentesco: null,
        plazaId: null,
        plazaNumero: null,
        tieneRostro: true,
      },
    ]),
    registrar: vi.fn(async () => escrito),
    editar: vi.fn(async () => escrito),
    darDeBaja: vi.fn(async () => escrito),
    plazaParaTraspaso: vi.fn(async () =>
      o.plaza === undefined
        ? { plazaId: 'plaza-2', generacion: 3, fechaNacimiento: '2008-10-06' }
        : o.plaza,
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
  const traspasos = { codigoDe: vi.fn(() => 'K7PQ2XWZ'), plazaDelCodigo: vi.fn() };
  const suprimir = { ejecutar: vi.fn(async () => exito({ suprimidas: 1 })) };
  const caso = new MenoresDeMiHogar(
    como<ResolverMiAmbito>(resolver),
    como<MenoresDelHogar>(menores),
    como<OcupantesDeLaVivienda>(ocupantes),
    como<CodigosDeOcupante>(traspasos),
    { ahora: () => AHORA },
    como<SuprimirPlantillasDeTitular>(suprimir),
  );
  return { caso, resolver, menores, suprimir, traspasos };
};

describe('MenoresDeMiHogar (15-W, D4)', () => {
  it('lista con el documento enmascarado y la edad del reloj inyectado', async () => {
    const { caso } = montar();
    const r = await caso.listar(ctx, COP);
    if (!r.ok) throw new Error('debía listar');
    expect(r.valor[0]).toMatchObject({ documento: '••••5678', edad: 11 });
    expect(r.valor[1]).toMatchObject({ documento: '••••7766', edad: null });
    expect(JSON.stringify(r.valor)).not.toContain('1012345678');
  });

  it('sin ámbito de vivienda, nada: el error del ámbito sube tal cual', async () => {
    const { caso, resolver, menores } = montar();
    resolver.ejecutar.mockResolvedValueOnce(
      fallo(errorDominio('ENTIDAD_NO_ENCONTRADA', 'Sin vivienda')),
    );
    const r = await caso.registrar(ctx, COP, ALTA);
    expect(r.ok).toBe(false);
    expect(menores.registrar).not.toHaveBeenCalled();
  });

  it('registra con el documento normalizado; 18 años HOY ya no es menor', async () => {
    const { caso, menores } = montar();
    expect(await caso.registrar(ctx, COP, ALTA)).toEqual({
      ok: true,
      valor: { hecho: true, residenteId: 'r-1' },
    });
    expect(menores.registrar).toHaveBeenCalledWith(COP, 'v-1', 'u-adulto', {
      ...ALTA,
      numeroDocumento: '1012345678',
    });
    const cumpleHoy = await caso.registrar(ctx, COP, { ...ALTA, fechaNacimiento: '2008-10-06' });
    expect(cumpleHoy).toEqual({
      ok: true,
      valor: {
        hecho: false,
        estado: 400,
        explicacion: 'Una persona mayor de edad crea su propia cuenta con un código de plaza',
      },
    });
    const cumpleManana = await caso.registrar(ctx, COP, { ...ALTA, fechaNacimiento: '2008-10-07' });
    expect(cumpleManana.ok && cumpleManana.valor.hecho).toBe(true);
  });

  it('fecha imposible o documento sin forma: 400, y la base no se toca', async () => {
    const { caso, menores } = montar();
    const fecha = await caso.registrar(ctx, COP, { ...ALTA, fechaNacimiento: '2015-02-30' });
    expect(fecha.ok && !fecha.valor.hecho && fecha.valor.estado).toBe(400);
    const documento = await caso.registrar(ctx, COP, { ...ALTA, numeroDocumento: '12' });
    expect(documento.ok && !documento.valor.hecho && documento.valor.explicacion).toContain(
      '4 a 20',
    );
    expect(menores.registrar).not.toHaveBeenCalled();
  });

  it('cada «no» de la base, con su estado: ajeno 404, plaza ocupada y documento ajeno 409', async () => {
    for (const [motivo, estado] of [
      ['NO_ENCONTRADO', 404],
      ['PLAZA_OCUPADA', 409],
      ['DOCUMENTO_EN_USO', 409],
    ] as const) {
      const { caso } = montar({ escrito: { ok: false, motivo } });
      const r = await caso.registrar(ctx, COP, ALTA);
      expect(r.ok && !r.valor.hecho && r.valor.estado, motivo).toBe(estado);
    }
  });

  it('editar respeta la edad: una fecha que lo vuelve mayor es 400', async () => {
    const { caso, menores } = montar();
    const datos = {
      nombres: 'Sofía',
      apellidos: 'Pérez',
      parentesco: 'Hija',
      fechaNacimiento: '2000-01-01',
    };
    const r = await caso.editar(ctx, COP, 'r-1', datos);
    expect(r.ok && !r.valor.hecho && r.valor.estado).toBe(400);
    expect(menores.editar).not.toHaveBeenCalled();
    const bien = await caso.editar(ctx, COP, 'r-1', { ...datos, fechaNacimiento: '2016-01-01' });
    expect(bien.ok && bien.valor.hecho).toBe(true);
  });

  it('la baja suprime las plantillas de la persona (RN-11); si no era suya, no suprime nada', async () => {
    const { caso, suprimir } = montar();
    expect((await caso.darDeBaja(ctx, COP, 'r-1', 'Se mudó')).ok).toBe(true);
    expect(suprimir.ejecutar).toHaveBeenCalledWith(ctx, COP, 'p-1');
    const ajeno = montar({ escrito: { ok: false, motivo: 'NO_ENCONTRADO' } });
    const r = await ajeno.caso.darDeBaja(ctx, COP, 'r-9', 'No es mío');
    expect(r.ok && !r.valor.hecho && r.valor.estado).toBe(404);
    expect(ajeno.suprimir.ejecutar).not.toHaveBeenCalled();
  });

  it('el código de traspaso: sólo el titular, sólo de su vivienda y sólo con 18 cumplidos', async () => {
    const noTitular = montar({ titular: false });
    const r403 = await noTitular.caso.codigoDeTraspaso(ctx, COP, 'r-1');
    expect(r403.ok && !r403.valor.hecho && r403.valor.estado).toBe(403);
    const ajena = montar({ plaza: null });
    const r404 = await ajena.caso.codigoDeTraspaso(ctx, COP, 'r-9');
    expect(r404.ok && !r404.valor.hecho && r404.valor.estado).toBe(404);
    for (const fechaNacimiento of ['2008-10-07', null]) {
      const menor = montar({ plaza: { plazaId: 'plaza-2', generacion: 3, fechaNacimiento } });
      const r = await menor.caso.codigoDeTraspaso(ctx, COP, 'r-1');
      expect(r.ok && !r.valor.hecho && r.valor.estado, String(fechaNacimiento)).toBe(409);
    }
    const { caso, traspasos } = montar();
    expect(await caso.codigoDeTraspaso(ctx, COP, 'r-1')).toEqual({
      ok: true,
      valor: { hecho: true, residenteId: 'r-1', codigo: 'MIRA-K7PQ-2XWZ' },
    });
    // La generación entra en el código: al liberarse la plaza, el anterior deja de servir.
    expect(traspasos.codigoDe).toHaveBeenCalledWith(COP, 'plaza-2', 3);
  });
});
