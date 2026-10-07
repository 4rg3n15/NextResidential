import { describe, expect, it } from 'vitest';
import { esExito, esFallo } from '../compartido/resultado';
import { ConsentimientoBiometrico } from './consentimiento';
import type { DatosDeRepresentacion } from './consentimiento';

/**
 * 15-X · D3 · el rostro de un menor de 15 a 17 años lo autoriza su
 * REPRESENTANTE LEGAL —el titular del hogar— (Ley 1581, art. 7). Nace con su
 * propio origen y su autor: no se disfraza de consentimiento del titular, y
 * sigue sin haber forma de que «otro consienta» fuera de esa figura (D-08).
 */
const MENOR = 'persona-menor-1';
const REPRESENTANTE = 'cuenta-titular-1';
const SUCESOR = 'cuenta-titular-2';
const AHORA = new Date('2026-10-07T15:00:00.000Z');
const LUEGO = new Date(AHORA.getTime() + 60_000);

const datos: DatosDeRepresentacion = {
  id: 'c-m-1',
  copropiedadId: 'cop-1',
  titularId: MENOR,
  finalidad: 'control_acceso',
  versionPolitica: 'rostro-menor-v1',
  canal: 'app',
  representanteId: REPRESENTANTE,
  ahora: AHORA,
};

const autorizar = (d: Partial<DatosDeRepresentacion> = {}): ConsentimientoBiometrico => {
  const r = ConsentimientoBiometrico.autorizarComoRepresentanteLegal({ ...datos, ...d });
  if (!esExito(r)) throw new Error(r.error.detalle);
  return r.valor;
};

describe('autorizarComoRepresentanteLegal · su origen y su autor', () => {
  it('nace vigente, del menor, con el origen del representante y su cuenta como autor', () => {
    const c = autorizar();
    expect(c.vigente).toBe(true);
    expect(c.titularId).toBe(MENOR);
    expect(c.origen).toBe('autorizado_por_representante_legal');
    expect(c.declaradoPor).toBe(REPRESENTANTE);
    expect(c.otorgadoEn).toEqual(AHORA);
    expect(c.versionPolitica).toBe('rostro-menor-v1');
  });

  it('sin representante, o con el propio menor como representante, no hay autorización', () => {
    for (const representanteId of ['', '   ', MENOR]) {
      const r = ConsentimientoBiometrico.autorizarComoRepresentanteLegal({
        ...datos,
        representanteId,
      });
      expect(esFallo(r)).toBe(true);
      if (esFallo(r)) expect(r.error.regla).toBe('RN-10');
    }
  });

  it('lo de todo consentimiento informado sigue: versión del texto y finalidad', () => {
    const sin = (d: Partial<DatosDeRepresentacion>): boolean =>
      esFallo(ConsentimientoBiometrico.autorizarComoRepresentanteLegal({ ...datos, ...d }));
    expect(sin({ versionPolitica: '' })).toBe(true);
    expect(sin({ finalidad: ' ' })).toBe(true);
    expect(sin({ titularId: '' })).toBe(true);
  });

  it('ya vigente, no se «otorga» después como si la hubiera dado el menor', () => {
    expect(esFallo(autorizar().otorgar(MENOR, LUEGO))).toBe(true);
  });
});

describe('revocar · el titular por `revocar`; el representante, por su propio método', () => {
  it('`revocar` sigue siendo SÓLO del titular: el representante no entra por ahí', () => {
    expect(esFallo(autorizar().revocar(REPRESENTANTE, LUEGO))).toBe(true);
    const r = autorizar().revocar(MENOR, LUEGO);
    expect(esExito(r) && r.valor.estado).toBe('revocado');
  });

  it('el representante la revoca sin condiciones, y revocar dos veces no es un error', () => {
    const r = autorizar().revocarComoRepresentanteLegal(REPRESENTANTE, LUEGO);
    expect(esExito(r)).toBe(true);
    if (!esExito(r)) return;
    expect(r.valor.estado).toBe('revocado');
    expect(r.valor.vigente).toBe(false);
    expect(r.valor.revocadoEn).toEqual(LUEGO);
    expect(esExito(r.valor.revocarComoRepresentanteLegal(REPRESENTANTE, LUEGO))).toBe(true);
  });

  it('también el titular del hogar que sucede al que la dio: retirarla siempre se puede', () => {
    expect(esExito(autorizar().revocarComoRepresentanteLegal(SUCESOR, LUEGO))).toBe(true);
  });

  it('sin representante, o con el propio menor, no', () => {
    for (const quien of ['', ' ', MENOR]) {
      const r = autorizar().revocarComoRepresentanteLegal(quien, LUEGO);
      expect(esFallo(r)).toBe(true);
      if (esFallo(r)) expect(r.error.regla).toBe('RN-10');
    }
  });

  it('el consentimiento PROPIO del titular, o la casilla de una visita, no los revoca un representante', () => {
    const propio = ConsentimientoBiometrico.solicitar({
      ...datos,
      solicitadoEn: AHORA,
      estado: 'vigente',
      otorgadoEn: AHORA,
    });
    const casilla = ConsentimientoBiometrico.declarar({ ...datos, declaradoPor: REPRESENTANTE });
    for (const c of [propio, casilla]) {
      if (!esExito(c)) throw new Error('preparación');
      const r = c.valor.revocarComoRepresentanteLegal(REPRESENTANTE, LUEGO);
      expect(esFallo(r)).toBe(true);
      if (esFallo(r)) expect(r.error.regla).toBe('RN-10');
    }
  });
});

describe('a los 18 · el titular, ya mayor, la confirma él mismo (D-10)', () => {
  it('el origen pasa a ser suyo y la vigencia no cambia', () => {
    const c = autorizar().confirmarPorElTitular(MENOR, LUEGO);
    expect(esExito(c)).toBe(true);
    if (!esExito(c)) return;
    expect(c.valor.origen).toBe('otorgado_por_el_titular');
    expect(c.valor.vigente).toBe(true);
    expect(c.valor.otorgadoEn).toEqual(LUEGO);
  });

  it('el representante no la «confirma» por el titular, ni se confirma lo revocado', () => {
    expect(esFallo(autorizar().confirmarPorElTitular(REPRESENTANTE, LUEGO))).toBe(true);
    const revocada = autorizar().revocarComoRepresentanteLegal(REPRESENTANTE, LUEGO);
    if (!esExito(revocada)) throw new Error('revocar');
    expect(esFallo(revocada.valor.confirmarPorElTitular(MENOR, LUEGO))).toBe(true);
  });
});

describe('D-08 · ningún método con forma de delegación, tampoco entre los estáticos', () => {
  it('los del representante llevan su nombre; ninguno «delega» ni consiente «por un tercero»', () => {
    const nombres = [
      ...Object.getOwnPropertyNames(ConsentimientoBiometrico.prototype),
      ...Object.getOwnPropertyNames(ConsentimientoBiometrico),
    ];
    expect(nombres.filter((m) => /delegar|enNombreDe|porTercero/i.test(m))).toEqual([]);
    expect(nombres).toEqual(
      expect.arrayContaining(['autorizarComoRepresentanteLegal', 'revocarComoRepresentanteLegal']),
    );
  });
});
