import { describe, expect, it } from 'vitest';
import {
  INTENTOS_DE_VINCULACION,
  decidirVinculacion,
  explicacionDeVinculacion,
} from './vinculacion';
import type { HechosDeVinculacion, MotivoDeNoVincular } from './vinculacion';
import {
  ALFABETO_DE_CODIGO,
  AVISO_OCUPANTES_DEFINITIVO,
  OCUPANTES_MAXIMO,
  codigoDesdeBytes,
  decidirDeclaracion,
  esMotivoDePermiso,
  formatearCodigoDeOcupante,
  normalizarCodigoDeOcupante,
} from './ocupantes';
import { explicacionDeVehiculo, validarVehiculoPropio } from './vehiculo-propio';
import type { MotivoDeNoRegistrarVehiculo } from './vehiculo-propio';
import { normalizarDocumento, validarPerfil } from './perfil';

const hechos = (h: Partial<HechosDeVinculacion> = {}): HechosDeVinculacion => ({
  intentosFallidosRecientes: 0,
  viviendaExiste: true,
  viviendaActiva: true,
  viviendaTieneCuenta: false,
  traeCodigo: false,
  ...h,
});

describe('vinculación con la vivienda (D6, 3.2)', () => {
  it('vivienda sin cuenta y «no lo tengo»: primer residente', () => {
    expect(decidirVinculacion(hechos())).toEqual({ vincular: 'como_primer_residente' });
  });
  it('vivienda con cuenta y sin código: el código es OBLIGATORIO', () => {
    expect(decidirVinculacion(hechos({ viviendaTieneCuenta: true }))).toEqual({
      vincular: false,
      motivo: 'CODIGO_REQUERIDO',
    });
  });
  it('con código, se valida contra las plazas (con o sin cuenta previa)', () => {
    expect(decidirVinculacion(hechos({ traeCodigo: true, viviendaTieneCuenta: true }))).toEqual({
      vincular: 'con_codigo',
    });
    expect(decidirVinculacion(hechos({ traeCodigo: true }))).toEqual({ vincular: 'con_codigo' });
  });
  it('el bloqueo por intentos va ANTES que la vivienda: no se esquiva probando otra', () => {
    const r = decidirVinculacion(
      hechos({ intentosFallidosRecientes: INTENTOS_DE_VINCULACION, viviendaExiste: false }),
    );
    expect(r).toEqual({ vincular: false, motivo: 'DEMASIADOS_INTENTOS' });
    expect(
      decidirVinculacion(hechos({ intentosFallidosRecientes: INTENTOS_DE_VINCULACION - 1 })),
    ).toEqual({ vincular: 'como_primer_residente' });
  });
  it('vivienda inexistente antes que inactiva, e inactiva antes que el código', () => {
    expect(decidirVinculacion(hechos({ viviendaExiste: false, viviendaActiva: false }))).toEqual({
      vincular: false,
      motivo: 'VIVIENDA_INEXISTENTE',
    });
    expect(decidirVinculacion(hechos({ viviendaActiva: false, traeCodigo: true }))).toEqual({
      vincular: false,
      motivo: 'VIVIENDA_INACTIVA',
    });
  });
  it('cada motivo tiene su explicación, sin nombrar a nadie', () => {
    const motivos: MotivoDeNoVincular[] = [
      'DEMASIADOS_INTENTOS',
      'VIVIENDA_INEXISTENTE',
      'AGRUPACION_REQUERIDA',
      'VIVIENDA_INACTIVA',
      'CODIGO_REQUERIDO',
      'CODIGO_INCORRECTO',
      'DOCUMENTO_EN_USO',
      'YA_VINCULADA',
    ];
    for (const m of motivos) expect(explicacionDeVinculacion(m).length).toBeGreaterThan(20);
  });
});

describe('ocupantes (D6, ADR-025)', () => {
  const base = { numero: 3, confirmado: true, esPrimerResidente: true, yaDeclarada: false };
  it('el primer residente declara, con confirmación explícita', () => {
    expect(decidirDeclaracion(base)).toEqual({ ok: true, valor: 3 });
  });
  it('declarada, NADIE más que el superadministrador la cambia: permiso antes que forma', () => {
    const r = decidirDeclaracion({ ...base, yaDeclarada: true, numero: 99, confirmado: false });
    expect(r).toEqual({ ok: false, error: 'YA_DECLARADA' });
    expect(esMotivoDePermiso('YA_DECLARADA')).toBe(true);
    const otro = decidirDeclaracion({ ...base, esPrimerResidente: false });
    expect(otro).toEqual({ ok: false, error: 'NO_ES_PRIMER_RESIDENTE' });
    expect(esMotivoDePermiso('NO_ES_PRIMER_RESIDENTE')).toBe(true);
  });
  it('sin confirmación no se declara, y el número va de 1 a 20', () => {
    expect(decidirDeclaracion({ ...base, confirmado: false })).toEqual({
      ok: false,
      error: 'SIN_CONFIRMACION',
    });
    for (const n of [0, OCUPANTES_MAXIMO + 1, 2.5]) {
      expect(decidirDeclaracion({ ...base, numero: n })).toEqual({
        ok: false,
        error: 'NUMERO_INVALIDO',
      });
    }
    expect(esMotivoDePermiso('NUMERO_INVALIDO')).toBe(false);
  });
  it('el aviso dice DEFINITIVO y a quién pedir el cambio', () => {
    expect(AVISO_OCUPANTES_DEFINITIVO).toContain('DEFINITIVO');
    expect(AVISO_OCUPANTES_DEFINITIVO).toContain('superadministrador');
  });
  it('el código: ocho símbolos del alfabeto sin confundibles, estable por bytes', () => {
    const c = codigoDesdeBytes(new Uint8Array([1, 2, 3, 4, 5, 6]));
    expect(c).toHaveLength(8);
    expect([...c].every((x) => ALFABETO_DE_CODIGO.includes(x))).toBe(true);
    expect(codigoDesdeBytes(new Uint8Array([1, 2, 3, 4, 5]))).toBe(c);
    expect(codigoDesdeBytes(new Uint8Array([0, 0, 0, 0, 0]))).toBe('AAAAAAAA');
    expect(codigoDesdeBytes(new Uint8Array([255, 255, 255, 255, 255]))).toBe('99999999');
    expect(codigoDesdeBytes(new Uint8Array([]))).toBe('AAAAAAAA');
  });
  it('lo que escribe el residente se normaliza; lo imposible se rechaza', () => {
    expect(normalizarCodigoDeOcupante(' abcd-efgh ')).toEqual({ ok: true, valor: 'ABCDEFGH' });
    expect(normalizarCodigoDeOcupante('ABC').ok).toBe(false);
    expect(normalizarCodigoDeOcupante('ABCDEFG0').ok).toBe(false);
    expect(formatearCodigoDeOcupante('ABCDEFGH')).toBe('ABCD-EFGH');
  });
});

describe('vehículo propio (D5 a)', () => {
  const ok = {
    placa: 'abc-123',
    color: ' Gris ',
    modelo: 'Mazda 3',
    marca: null,
    tipo: 'automovil',
    ocupantes: ['r1', 'r1', 'r2'],
  };
  it('normaliza la placa, sanea el texto y quita ocupantes repetidos', () => {
    const r = validarVehiculoPropio(ok, ['r1', 'r2']);
    expect(r.ok && r.valor).toMatchObject({
      placa: 'ABC123',
      color: 'Gris',
      ocupantes: ['r1', 'r2'],
    });
  });
  it('uno o más ocupantes, y todos de la vivienda', () => {
    expect(validarVehiculoPropio({ ...ok, ocupantes: [] }, ['r1'])).toMatchObject({
      ok: false,
      error: { motivo: 'SIN_OCUPANTES' },
    });
    expect(validarVehiculoPropio(ok, ['r1'])).toMatchObject({
      ok: false,
      error: { motivo: 'OCUPANTE_AJENO' },
    });
  });
  it('placa, color, modelo y tipo inválidos se rechazan como datos', () => {
    for (const malo of [
      { ...ok, placa: 'A' },
      { ...ok, color: '   ' },
      { ...ok, tipo: 'tanque' },
    ]) {
      expect(validarVehiculoPropio(malo, ['r1', 'r2'])).toMatchObject({
        ok: false,
        error: { motivo: 'DATOS_INVALIDOS' },
      });
    }
    const conMarca = validarVehiculoPropio({ ...ok, marca: 'Mazda' }, ['r1', 'r2']);
    expect(conMarca.ok && conMarca.valor.marca).toBe('Mazda');
  });
  it('el tope se explica diciendo a quién pedir el siguiente', () => {
    expect(explicacionDeVehiculo('TOPE_ALCANZADO', 2)).toContain('superadministrador');
    expect(explicacionDeVehiculo('TOPE_ALCANZADO')).toContain('máximo');
    const motivos: MotivoDeNoRegistrarVehiculo[] = [
      'PLACA_DUPLICADA',
      'VIVIENDA_INACTIVA',
      'OCUPANTE_AJENO',
      'SIN_OCUPANTES',
      'DATOS_INVALIDOS',
    ];
    for (const m of motivos) expect(explicacionDeVehiculo(m).length).toBeGreaterThan(10);
  });
});

describe('perfil del residente (3.5)', () => {
  const hoy = new Date('2026-09-26T12:00:00Z');
  const datos = {
    nombres: ' Ana ',
    apellidos: 'Pérez',
    fechaNacimiento: '1990-05-17',
    tipoDocumento: 'cedula',
    numeroDocumento: '52.123.456',
    correo: 'Ana@Correo.invalid',
    telefono: '+57 300 111 2233',
  };
  it('sanea y normaliza: documento, correo en minúsculas y teléfono sin espacios', () => {
    const r = validarPerfil(datos, hoy);
    expect(r.ok && r.valor).toMatchObject({
      nombres: 'Ana',
      numeroDocumento: '52123456',
      correo: 'ana@correo.invalid',
      telefono: '+573001112233',
    });
    expect(normalizarDocumento('ab-12 34')).toBe('AB1234');
  });
  it('devuelve TODOS los campos malos de una vez, sin el valor del documento', () => {
    const r = validarPerfil(
      {
        ...datos,
        nombres: '',
        apellidos: 'x'.repeat(101),
        correo: 'no',
        telefono: '12',
        tipoDocumento: 'dni',
        numeroDocumento: '1',
      },
      hoy,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.map((c) => c.campo).sort()).toEqual(
        ['apellidos', 'correo', 'nombres', 'numeroDocumento', 'telefono', 'tipoDocumento'].sort(),
      );
      expect(JSON.stringify(r.error)).not.toContain('"1"');
    }
  });
  it('la fecha: formato, que exista, desde 1900 y nunca futura (reloj inyectado)', () => {
    for (const [f, esperado] of [
      ['17/05/1990', 'AAAA-MM-DD'],
      ['1990-02-30', 'no existe'],
      ['1899-12-31', '1900'],
      ['2026-09-27', 'futura'],
    ] as const) {
      const r = validarPerfil({ ...datos, fechaNacimiento: f }, hoy);
      expect(!r.ok && r.error[0]?.motivo).toContain(esperado);
    }
    expect(validarPerfil({ ...datos, fechaNacimiento: null }, hoy).ok).toBe(true);
  });
});
