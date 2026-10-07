import { describe, expect, it } from 'vitest';
import { evaluarAcceso } from '@ncr/domain-core';
import { contextoDesde, resolverIdentidad } from './instantanea-de-reglas';
import type { AutorizacionEnCache, HechoLocal, InstantaneaDeReglas } from './instantanea-de-reglas';

/**
 * 15-X · D1 · el ROSTRO del residente, decidido en el Edge como en la nube.
 *
 * La instantánea trae el derecho del residente por persona como autorización
 * sintética `residente:persona:<residenteId>`. El Edge la aplica SÓLO a un
 * acceso facial de ESA persona —como la del vehículo sólo a la lectura de ese
 * vehículo— y de ella saca la vivienda. Antes, sin vivienda, el motor negaba
 * con FALLO_TECNICO lo que la nube ya permite (RN-16).
 */
const COP = '11111111-1111-4111-8111-111111111111';
const VIVIENDA = '22222222-2222-4222-8222-222222222222';
const RESIDENTE = '33333333-3333-4333-8333-333333333333';
const OTRA = '55555555-5555-4555-8555-555555555555';
const AHORA = new Date('2026-10-07T15:00:00.000Z');

const derecho = (cambios: Partial<AutorizacionEnCache> = {}): AutorizacionEnCache => ({
  id: 'residente:persona:66666666-6666-4666-8666-666666666666',
  viviendaId: VIVIENDA,
  personaId: RESIDENTE,
  desde: '2026-01-15T12:00:00.000Z',
  hasta: '2126-01-15T12:00:00.000Z',
  estado: 'vigente',
  zonasPermitidas: [],
  acompanantes: [],
  maximoAcompanantes: 0,
  patron: null,
  placa: null,
  ...cambios,
});

const instantanea = (cambios: Partial<InstantaneaDeReglas> = {}): InstantaneaDeReglas => ({
  copropiedadId: COP,
  version: 9,
  generadaEn: AHORA.toISOString(),
  autorizaciones: [derecho()],
  personasEnListaNegra: [],
  placasEnListaNegra: [],
  viviendasActivas: [VIVIENDA],
  vehiculos: [],
  zonas: [],
  personasConConsentimiento: [RESIDENTE],
  plantillas: [
    { plantillaId: 'pl-1', personaId: RESIDENTE, reconocibleHasta: '2027-10-07T00:00:00.000Z' },
  ],
  umbralDeConfianza: 0.8,
  ...cambios,
});

const rostro = (personaId: string, cambios: Partial<HechoLocal> = {}): HechoLocal => ({
  dispositivoId: 'terminal-1',
  metodo: 'facial',
  referenciaExterna: 'evt-rostro',
  confianza: 1,
  placaLeida: null,
  personaId,
  zonaId: null,
  ocurridoEn: AHORA,
  ...cambios,
});

const decidir = (i: InstantaneaDeReglas, h: HechoLocal): string => {
  const contexto = contextoDesde(i, h, resolverIdentidad(i, h));
  if (contexto === null) throw new Error('instantánea no construible');
  const r = evaluarAcceso(contexto);
  return r.permitido ? 'PERMITIDO' : r.motivo;
};

describe('15-X · D1 · el rostro del residente en el Edge', () => {
  it('su rostro trae su vivienda y su derecho: PERMITIDO', () => {
    const i = instantanea();
    const h = rostro(RESIDENTE);
    expect(resolverIdentidad(i, h).viviendaId).toBe(VIVIENDA);
    const c = contextoDesde(i, h, resolverIdentidad(i, h));
    expect(c?.autorizaciones.map((a) => a.id)).toEqual([derecho().id]);
    expect(c?.viviendaActiva).toBe(true);
    expect(decidir(i, h)).toBe('PERMITIDO');
  });

  it('vetado: LISTA_NEGRA, aunque viva allí', () => {
    expect(decidir(instantanea({ personasEnListaNegra: [RESIDENTE] }), rostro(RESIDENTE))).toBe(
      'LISTA_NEGRA',
    );
  });

  it('sin plantilla reconocible (sin consentimiento): SIN_CONSENTIMIENTO', () => {
    const i = instantanea({
      plantillas: [{ plantillaId: 'pl-1', personaId: RESIDENTE, reconocibleHasta: null }],
    });
    expect(decidir(i, rostro(RESIDENTE))).toBe('SIN_CONSENTIMIENTO');
  });

  it('de baja: VIGENCIA_EXPIRADA, con su vivienda', () => {
    const i = instantanea({
      autorizaciones: [derecho({ hasta: '2026-10-01T05:00:00.000Z' })],
      viviendasActivas: [],
    });
    expect(resolverIdentidad(i, rostro(RESIDENTE)).viviendaId).toBe(VIVIENDA);
    expect(decidir(i, rostro(RESIDENTE))).toBe('VIGENCIA_EXPIRADA');
  });

  it('el rostro de OTRA persona no gana el derecho del residente', () => {
    const i = instantanea({ personasConConsentimiento: [RESIDENTE, OTRA] });
    const h = rostro(OTRA);
    expect(resolverIdentidad(i, h).viviendaId).toBeNull();
    expect(contextoDesde(i, h, resolverIdentidad(i, h))?.autorizaciones).toEqual([]);
  });

  it('una lectura que no es facial no gana el derecho de la persona', () => {
    const h = rostro(RESIDENTE, { metodo: 'manual' });
    const i = instantanea();
    expect(contextoDesde(i, h, resolverIdentidad(i, h))?.autorizaciones).toEqual([]);
  });
});
