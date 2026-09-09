import { describe, expect, it } from 'vitest';
import { esExito, esFallo } from '../compartido/resultado';
import { CalidadDeCaptura } from './calidad-captura';
import { ConsentimientoBiometrico } from './consentimiento';
import type { DatosConsentimiento } from './consentimiento';
import { PlantillaBiometrica } from './plantilla';
import type { DatosPlantilla } from './plantilla';

const AHORA = new Date('2026-09-08T10:00:00.000Z');
const HORA = 3_600_000;
const TITULAR = 'visitante-1';

const calidad = (v = 0.9): CalidadDeCaptura => {
  const r = CalidadDeCaptura.crear(v);
  if (!esExito(r)) throw new Error('calidad inválida en la prueba');
  return r.valor;
};

const datosBase: DatosPlantilla = {
  id: 'p-1',
  copropiedadId: 'cop-1',
  titularId: TITULAR,
  consentimientoId: 'c-1',
  autorizacionId: 'a-1',
  calidad: calidad(),
  creadoEn: AHORA,
  suprimirEn: new Date(AHORA.getTime() + 8 * HORA),
};

const plantilla = (datos: Partial<DatosPlantilla> = {}): PlantillaBiometrica => {
  const r = PlantillaBiometrica.crear({ ...datosBase, ...datos });
  if (!esExito(r)) throw new Error(r.error.detalle);
  return r.valor;
};

const consentimiento = (datos: Partial<DatosConsentimiento> = {}): ConsentimientoBiometrico => {
  const r = ConsentimientoBiometrico.solicitar({
    id: 'c-1',
    copropiedadId: 'cop-1',
    titularId: TITULAR,
    finalidad: 'control_acceso',
    versionPolitica: 'v1.0',
    canal: 'app',
    solicitadoEn: AHORA,
    ...datos,
  });
  if (!esExito(r)) throw new Error(r.error.detalle);
  return r.valor;
};

const vigente = (datos: Partial<DatosConsentimiento> = {}): ConsentimientoBiometrico =>
  consentimiento({ estado: 'vigente', otorgadoEn: AHORA, ...datos });

describe('PlantillaBiometrica · el vector no vive aquí', () => {
  it('el agregado no expone el dato biométrico', () => {
    const campos = Object.keys(plantilla());
    expect(campos).not.toContain('vector');
    expect(campos).not.toContain('vectorCifrado');
    expect(campos).not.toContain('llaveRef');
  });

  it('nace pendiente de consentimiento aunque la captura fuera perfecta', () => {
    expect(plantilla().estado).toBe('pendiente_consentimiento');
  });
});

describe('PlantillaBiometrica · RN-09, sin consentimiento vigente no hay sincronización', () => {
  it('con el consentimiento pendiente, no', () => {
    const r = plantilla().habilitarSincronizacion(consentimiento());
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.regla).toBe('RN-09');
  });

  it('con el consentimiento revocado, tampoco', () => {
    const revocado = consentimiento({ estado: 'revocado', revocadoEn: AHORA });
    expect(esFallo(plantilla().habilitarSincronizacion(revocado))).toBe(true);
  });

  it('con el consentimiento vigente, sí', () => {
    const r = plantilla().habilitarSincronizacion(vigente());
    expect(esExito(r)).toBe(true);
    if (esExito(r)) expect(r.valor.estado).toBe('pendiente_sincronizacion');
  });

  it('el consentimiento de OTRO titular no vale, aunque esté vigente (RN-10)', () => {
    const ajeno = vigente({ id: 'c-1', titularId: 'otra-persona' });
    const r = plantilla().habilitarSincronizacion(ajeno);
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.regla).toBe('RN-10');
  });

  it('un consentimiento que no es el de esta plantilla se rechaza', () => {
    const otro = vigente({ id: 'c-9' });
    expect(esFallo(plantilla().habilitarSincronizacion(otro))).toBe(true);
  });

  it('una plantilla suprimida no revive: se captura de nuevo', () => {
    const suprimida = plantilla().suprimirPorRevocacion(AHORA);
    const r = suprimida.habilitarSincronizacion(vigente());
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.regla).toBe('RN-11');
  });

  it('recibe el consentimiento, no un booleano: la regla se comprueba aquí', () => {
    const firma = PlantillaBiometrica.prototype.habilitarSincronizacion.length;
    expect(firma).toBe(1);
  });
});

describe('PlantillaBiometrica · RN-11, el plazo es el compromiso legal', () => {
  it('la supresión se programa hacia el futuro', () => {
    const r = PlantillaBiometrica.crear({ ...datosBase, suprimirEn: AHORA });
    expect(esFallo(r)).toBe(true);
  });

  it('un plazo por encima de la cota legal se rechaza en el dominio', () => {
    const r = PlantillaBiometrica.crear({
      ...datosBase,
      suprimirEn: new Date(AHORA.getTime() + 6 * 365 * 24 * HORA),
    });
    expect(esFallo(r)).toBe(true);
    if (esFallo(r)) expect(r.error.regla).toBe('RN-11');
  });

  it('dentro de la cota, se acepta', () => {
    const r = PlantillaBiometrica.crear({
      ...datosBase,
      suprimirEn: new Date(AHORA.getTime() + 2 * 365 * 24 * HORA),
    });
    expect(esExito(r)).toBe(true);
  });

  it('no se suprime por vencimiento lo que aún no vence', () => {
    const r = plantilla().suprimirPorVencimiento(new Date(AHORA.getTime() + 1 * HORA));
    expect(esFallo(r)).toBe(true);
  });

  it('en el instante exacto del plazo, sí vence', () => {
    const p = plantilla();
    expect(p.venceEn(new Date(AHORA.getTime() + 8 * HORA))).toBe(true);
    expect(p.venceEn(new Date(AHORA.getTime() + 8 * HORA - 1))).toBe(false);
  });

  it('revocar adelanta la supresión a AHORA, sin condiciones (CA-11)', () => {
    const activa = plantilla({ estado: 'activa', sincronizadaEn: AHORA });
    const momento = new Date(AHORA.getTime() + HORA);
    const suprimida = activa.suprimirPorRevocacion(momento);
    expect(suprimida.estado).toBe('suprimida');
    expect(suprimida.suprimidaEn).toEqual(momento);
    expect(suprimida.suprimirEn).toEqual(momento);
  });

  it('suprimir por revocación es idempotente', () => {
    const una = plantilla().suprimirPorRevocacion(AHORA);
    expect(una.suprimirPorRevocacion(new Date(AHORA.getTime() + HORA))).toBe(una);
  });
});

describe('PlantillaBiometrica · CA-10, la cola de retirada', () => {
  it('una plantilla suprimida que llegó a una terminal exige retirada', () => {
    const activa = plantilla({ estado: 'activa', sincronizadaEn: AHORA });
    expect(activa.suprimirPorRevocacion(AHORA).exigeRetirada).toBe(true);
  });

  it('una que nunca se sincronizó, no: no hay de dónde retirarla', () => {
    expect(plantilla().suprimirPorRevocacion(AHORA).exigeRetirada).toBe(false);
  });

  it('solo se marca sincronizada lo que estaba pendiente de sincronizar', () => {
    expect(esFallo(plantilla().marcarSincronizada(AHORA))).toBe(true);
    const lista = plantilla({ estado: 'pendiente_sincronizacion' });
    const r = lista.marcarSincronizada(AHORA);
    expect(esExito(r)).toBe(true);
    if (esExito(r)) expect(r.valor.estado).toBe('activa');
  });
});
