import { describe, expect, it } from 'vitest';
import { esExito, esFallo } from '../compartido/resultado';
import { ConsentimientoBiometrico } from './consentimiento';
import type { DatosConsentimiento } from './consentimiento';

const TITULAR = 'visitante-1';
const RESIDENTE = 'residente-1';
const AHORA = new Date('2026-09-08T10:00:00.000Z');

const base: DatosConsentimiento = {
  id: 'c-1',
  copropiedadId: 'cop-1',
  titularId: TITULAR,
  finalidad: 'control_acceso',
  versionPolitica: 'v1.0',
  canal: 'app',
  solicitadoEn: AHORA,
};

const abrir = (datos: Partial<DatosConsentimiento> = {}): ConsentimientoBiometrico => {
  const r = ConsentimientoBiometrico.solicitar({ ...base, ...datos });
  if (!esExito(r)) throw new Error(r.error.detalle);
  return r.valor;
};

describe('ConsentimientoBiometrico · RN-10, el titular y nadie más', () => {
  it('nace pendiente: solicitarlo no es tenerlo', () => {
    expect(abrir().estado).toBe('pendiente');
    expect(abrir().vigente).toBe(false);
  });

  it('el RESIDENTE no puede otorgar el consentimiento del visitante', () => {
    const r = abrir().otorgar(RESIDENTE, AHORA);
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.regla).toBe('RN-10');
  });

  it('tampoco puede rechazarlo ni revocarlo en su nombre', () => {
    expect(esFallo(abrir().rechazar(RESIDENTE, AHORA))).toBe(true);
    const vigente = abrir({ estado: 'vigente', otorgadoEn: AHORA });
    expect(esFallo(vigente.revocar(RESIDENTE, AHORA))).toBe(true);
  });

  it('el titular sí, y entonces queda vigente', () => {
    const r = abrir().otorgar(TITULAR, AHORA, 'ev-1');
    expect(esExito(r)).toBe(true);
    if (esExito(r)) {
      expect(r.valor.vigente).toBe(true);
      expect(r.valor.otorgadoEn).toEqual(AHORA);
      expect(r.valor.evidenciaId).toBe('ev-1');
    }
  });

  it('la API no ofrece forma de consentir en nombre de otro (D-08)', () => {
    // Lo que se comprueba NO es que exista una comprobación, sino que no exista
    // el método: una comprobación se puede quitar sin que nadie lo note.
    const metodos = Object.getOwnPropertyNames(ConsentimientoBiometrico.prototype);
    expect(metodos.filter((m) => /delegar|enNombreDe|porTercero/i.test(m))).toEqual([]);
    expect(Object.keys(abrir())).not.toContain('residenteId');
  });
});

describe('ConsentimientoBiometrico · ciclo de vida', () => {
  it('no se otorga dos veces', () => {
    const vigente = abrir({ estado: 'vigente', otorgadoEn: AHORA });
    expect(esFallo(vigente.otorgar(TITULAR, AHORA))).toBe(true);
  });

  it('revocar es un derecho sin condiciones: no pide motivo ni aprobación', () => {
    const vigente = abrir({ estado: 'vigente', otorgadoEn: AHORA });
    const despues = new Date(AHORA.getTime() + 60_000);
    const r = vigente.revocar(TITULAR, despues);
    expect(esExito(r)).toBe(true);
    if (esExito(r)) {
      expect(r.valor.estado).toBe('revocado');
      expect(r.valor.vigente).toBe(false);
      expect(r.valor.revocadoEn).toEqual(despues);
    }
  });

  it('revocar dos veces no es un error', () => {
    const revocado = abrir({ estado: 'revocado', revocadoEn: AHORA });
    const r = revocado.revocar(TITULAR, AHORA);
    expect(esExito(r)).toBe(true);
  });

  it('lo rechazado no se puede revocar: no había nada que revocar', () => {
    const rechazado = abrir({ estado: 'rechazado', revocadoEn: AHORA });
    expect(esFallo(rechazado.revocar(TITULAR, AHORA))).toBe(true);
  });

  it('expirar y rechazar son estados distintos: callar no es negarse', () => {
    const r = abrir().expirar(AHORA);
    expect(esExito(r)).toBe(true);
    if (esExito(r)) expect(r.valor.estado).toBe('expirado');
  });

  it('solo expira lo que sigue pendiente', () => {
    const vigente = abrir({ estado: 'vigente', otorgadoEn: AHORA });
    expect(esFallo(vigente.expirar(AHORA))).toBe(true);
  });

  it('el plazo de respuesta se mide contra el reloj inyectado', () => {
    const c = abrir();
    const antes = new Date(AHORA.getTime() + 23 * 3_600_000);
    const justo = new Date(AHORA.getTime() + 24 * 3_600_000);
    expect(c.venciendo(antes, 24)).toBe(false);
    expect(c.venciendo(justo, 24)).toBe(true);
  });
});

describe('ConsentimientoBiometrico · consentimiento informado', () => {
  it('sin versión de política no hay consentimiento informado', () => {
    expect(esFallo(ConsentimientoBiometrico.solicitar({ ...base, versionPolitica: '  ' }))).toBe(
      true,
    );
  });

  it('sin finalidad tampoco', () => {
    expect(esFallo(ConsentimientoBiometrico.solicitar({ ...base, finalidad: '' }))).toBe(true);
  });

  it('sin titular, menos aún', () => {
    expect(esFallo(ConsentimientoBiometrico.solicitar({ ...base, titularId: '' }))).toBe(true);
  });

  it('es inmutable: otorgar devuelve otro, no muta el original', () => {
    const pendiente = abrir();
    const r = pendiente.otorgar(TITULAR, AHORA);
    expect(pendiente.estado).toBe('pendiente');
    expect(Object.isFrozen(pendiente)).toBe(true);
    if (esExito(r)) expect(r.valor).not.toBe(pendiente);
  });
});

describe('F4 (15-L) · el consentimiento DECLARADO por quien registra no se confunde con el del titular', () => {
  const declaracion = {
    id: 'c-2',
    copropiedadId: 'cop-1',
    titularId: TITULAR,
    finalidad: 'control_acceso',
    versionPolitica: 'casilla-v1',
    canal: 'app' as const,
    declaradoPor: RESIDENTE,
    ahora: AHORA,
  };

  it('nace vigente, con su origen, su autor y la versión del texto marcado', () => {
    const r = ConsentimientoBiometrico.declarar(declaracion);
    expect(esExito(r)).toBe(true);
    if (!esExito(r)) return;
    expect(r.valor.vigente).toBe(true);
    expect(r.valor.origen).toBe('declarado_por_quien_registra');
    expect(r.valor.declaradoPor).toBe(RESIDENTE);
    expect(r.valor.versionPolitica).toBe('casilla-v1');
    expect(r.valor.otorgadoEn).toEqual(AHORA);
  });

  it('sin autor, o sin versión del texto, no hay declaración', () => {
    expect(esFallo(ConsentimientoBiometrico.declarar({ ...declaracion, declaradoPor: ' ' }))).toBe(
      true,
    );
    expect(
      esFallo(ConsentimientoBiometrico.declarar({ ...declaracion, versionPolitica: '' })),
    ).toBe(true);
  });

  it('lo solicitado a la antigua sigue siendo del titular, y la declaración no se «otorga»', () => {
    expect(abrir().origen).toBe('otorgado_por_el_titular');
    const r = ConsentimientoBiometrico.declarar(declaracion);
    if (!esExito(r)) throw new Error('declarar');
    // Ya está vigente: otorgar() no la convierte en del titular.
    expect(esFallo(r.valor.otorgar(TITULAR, AHORA))).toBe(true);
  });

  it('el titular presente puede confirmarla (D-10 como opción); nadie más', () => {
    const r = ConsentimientoBiometrico.declarar(declaracion);
    if (!esExito(r)) throw new Error('declarar');
    expect(esFallo(r.valor.confirmarPorElTitular(RESIDENTE, AHORA))).toBe(true);
    const despues = new Date(AHORA.getTime() + 60_000);
    const c = r.valor.confirmarPorElTitular(TITULAR, despues);
    expect(esExito(c)).toBe(true);
    if (!esExito(c)) return;
    expect(c.valor.origen).toBe('otorgado_por_el_titular');
    expect(c.valor.vigente).toBe(true);
    expect(c.valor.otorgadoEn).toEqual(despues);
    // Una ya del titular, o una revocada, no se confirma.
    expect(esFallo(c.valor.confirmarPorElTitular(TITULAR, despues))).toBe(true);
    const revocada = r.valor.revocar(TITULAR, despues);
    if (!esExito(revocada)) throw new Error('revocar');
    expect(esFallo(revocada.valor.confirmarPorElTitular(TITULAR, despues))).toBe(true);
  });

  it('revocar sigue siendo del titular también en una declaración (RN-11 intacta)', () => {
    const r = ConsentimientoBiometrico.declarar(declaracion);
    if (!esExito(r)) throw new Error('declarar');
    expect(esFallo(r.valor.revocar(RESIDENTE, AHORA))).toBe(true);
    const revocada = r.valor.revocar(TITULAR, AHORA);
    expect(esExito(revocada) && revocada.valor.vigente).toBe(false);
  });
});
