import { describe, expect, it } from 'vitest';
import { esExito } from '../compartido/resultado';
import { CalidadDeCaptura } from './calidad-captura';
import { ConsentimientoBiometrico } from './consentimiento';
import type { DatosConsentimiento } from './consentimiento';
import { PlantillaBiometrica } from './plantilla';
import type { DatosPlantilla } from './plantilla';
import {
  plantillasPorRetirar,
  plantillasPorSuprimir,
  puedeReconocer,
  puedeSincronizar,
} from './politica-consentimiento';

const AHORA = new Date('2026-09-08T10:00:00.000Z');
const HORA = 3_600_000;

const calidad = (): CalidadDeCaptura => {
  const r = CalidadDeCaptura.crear(0.9);
  if (!esExito(r)) throw new Error('calidad');
  return r.valor;
};

const plantilla = (datos: Partial<DatosPlantilla> = {}): PlantillaBiometrica => {
  const r = PlantillaBiometrica.crear({
    id: 'p-1',
    copropiedadId: 'cop-1',
    titularId: 'visitante-1',
    consentimientoId: 'c-1',
    calidad: calidad(),
    creadoEn: AHORA,
    suprimirEn: new Date(AHORA.getTime() + 8 * HORA),
    ...datos,
  });
  if (!esExito(r)) throw new Error(r.error.detalle);
  return r.valor;
};

const consentimiento = (datos: Partial<DatosConsentimiento> = {}): ConsentimientoBiometrico => {
  const r = ConsentimientoBiometrico.solicitar({
    id: 'c-1',
    copropiedadId: 'cop-1',
    titularId: 'visitante-1',
    finalidad: 'control_acceso',
    versionPolitica: 'v1.0',
    canal: 'app',
    solicitadoEn: AHORA,
    ...datos,
  });
  if (!esExito(r)) throw new Error(r.error.detalle);
  return r.valor;
};

const vigente = consentimiento({ estado: 'vigente', otorgadoEn: AHORA });

describe('PolíticaConsentimiento · puedeSincronizar', () => {
  it('sin consentimiento, no', () => {
    expect(puedeSincronizar(plantilla(), null, AHORA)).toEqual({
      permitido: false,
      motivo: 'SIN_CONSENTIMIENTO',
    });
  });

  it('con el consentimiento vigente y el plazo vivo, sí', () => {
    expect(puedeSincronizar(plantilla(), vigente, AHORA)).toEqual({ permitido: true });
  });

  it('el consentimiento de otro titular tiene motivo PROPIO, no «sin consentimiento»', () => {
    // Describir mal el hecho en el evento de auditoría es un fallo por sí solo:
    // no es que faltara permiso, es que el permiso era de otra persona.
    const ajeno = consentimiento({ estado: 'vigente', otorgadoEn: AHORA, titularId: 'otro' });
    expect(puedeSincronizar(plantilla(), ajeno, AHORA)).toEqual({
      permitido: false,
      motivo: 'CONSENTIMIENTO_DE_OTRO_TITULAR',
    });
  });

  it('la titularidad se comprueba ANTES que la vigencia', () => {
    const ajenoYRevocado = consentimiento({
      estado: 'revocado',
      revocadoEn: AHORA,
      titularId: 'otro',
    });
    expect(puedeSincronizar(plantilla(), ajenoYRevocado, AHORA)).toEqual({
      permitido: false,
      motivo: 'CONSENTIMIENTO_DE_OTRO_TITULAR',
    });
  });

  it('una plantilla suprimida no se propaga aunque el consentimiento siga vigente', () => {
    const suprimida = plantilla().suprimirPorRevocacion(AHORA);
    expect(puedeSincronizar(suprimida, vigente, AHORA)).toEqual({
      permitido: false,
      motivo: 'PLANTILLA_SUPRIMIDA',
    });
  });

  it('pasado el plazo, no se propaga aunque nadie haya revocado', () => {
    expect(puedeSincronizar(plantilla(), vigente, new Date(AHORA.getTime() + 9 * HORA))).toEqual({
      permitido: false,
      motivo: 'PLAZO_VENCIDO',
    });
  });
});

describe('PolíticaConsentimiento · puedeReconocer', () => {
  it('exige además que la plantilla esté ya en la terminal', () => {
    expect(
      puedeReconocer(plantilla({ estado: 'pendiente_sincronizacion' }), vigente, AHORA),
    ).toEqual({ permitido: false, motivo: 'SIN_CONSENTIMIENTO' });
    expect(
      puedeReconocer(plantilla({ estado: 'activa', sincronizadaEn: AHORA }), vigente, AHORA),
    ).toEqual({ permitido: true });
  });

  it('revocado entre sincronizar y reconocer: ya no se reconoce', () => {
    const activa = plantilla({ estado: 'activa', sincronizadaEn: AHORA });
    const revocado = consentimiento({ estado: 'revocado', revocadoEn: AHORA });
    expect(puedeReconocer(activa, revocado, AHORA)).toEqual({
      permitido: false,
      motivo: 'SIN_CONSENTIMIENTO',
    });
  });
});

describe('PolíticaConsentimiento · las dos colas', () => {
  it('el barrido toma las vencidas y deja las vivas y las ya suprimidas', () => {
    const viva = plantilla({ id: 'viva' });
    const vencida = plantilla({ id: 'vencida', suprimirEn: new Date(AHORA.getTime() + HORA) });
    const yaSuprimida = plantilla({ id: 'ya' }).suprimirPorRevocacion(AHORA);
    const enDosHoras = new Date(AHORA.getTime() + 2 * HORA);
    expect(
      plantillasPorSuprimir([viva, vencida, yaSuprimida], enDosHoras).map((p) => p.id),
    ).toEqual(['vencida']);
  });

  it('la cola de retirada son las suprimidas que llegaron a una terminal', () => {
    const nuncaSincronizada = plantilla({ id: 'a' }).suprimirPorRevocacion(AHORA);
    const sincronizada = plantilla({
      id: 'b',
      estado: 'activa',
      sincronizadaEn: AHORA,
    }).suprimirPorRevocacion(AHORA);
    expect(plantillasPorRetirar([nuncaSincronizada, sincronizada]).map((p) => p.id)).toEqual(['b']);
  });

  it('son funciones puras: no mutan la lista que reciben', () => {
    const lista = [plantilla()];
    const copia = [...lista];
    plantillasPorSuprimir(lista, AHORA);
    plantillasPorRetirar(lista);
    expect(lista).toEqual(copia);
  });
});
