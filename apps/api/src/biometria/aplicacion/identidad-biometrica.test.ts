import { describe, expect, it } from 'vitest';
import {
  CalidadDeCaptura,
  ConsentimientoBiometrico,
  PlantillaBiometrica,
  esExito,
} from '@ncr/domain-core';
import { IdentidadBiometricaDesdeRepositorios } from './identidad-biometrica';
import {
  RepositorioConsentimientosEnMemoria,
  RepositorioPlantillasEnMemoria,
} from '../infraestructura/repositorios-en-memoria';

/**
 * A2 · quién es el dueño de una plantilla y si se le puede reconocer AHORA.
 * La segunda pregunta la contesta `puedeReconocer` del dominio: consentimiento
 * vigente Y plantilla activa. Aquí se afirma que la identidad la aplica a las
 * plantillas del titular y no inventa nada por su cuenta.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const TITULAR = '40000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-09-25T12:00:00Z');

const desenvolver = <T>(r: { ok: boolean; valor?: T }): T => {
  if (!esExito(r as never)) throw new Error('resultado fallido en la prueba');
  return (r as { valor: T }).valor;
};

const montar = (opciones: { otorgado: boolean; activa: boolean }) => {
  const consentimientos = new RepositorioConsentimientosEnMemoria();
  const plantillas = new RepositorioPlantillasEnMemoria();
  let consentimiento = desenvolver(
    ConsentimientoBiometrico.solicitar({
      id: 'c-1',
      copropiedadId: COP,
      titularId: TITULAR,
      finalidad: 'control_acceso',
      versionPolitica: 'v1',
      canal: 'app',
      solicitadoEn: new Date('2026-09-25T10:00:00Z'),
    }),
  );
  if (opciones.otorgado) {
    consentimiento = desenvolver(consentimiento.otorgar(TITULAR, new Date('2026-09-25T10:05:00Z')));
  }
  consentimientos.declarar(consentimiento);

  let plantilla = desenvolver(
    PlantillaBiometrica.crear({
      id: 'p-1',
      copropiedadId: COP,
      titularId: TITULAR,
      consentimientoId: 'c-1',
      calidad: desenvolver(CalidadDeCaptura.crear(0.9)),
      creadoEn: new Date('2026-09-25T10:00:00Z'),
      suprimirEn: new Date('2026-09-26T10:00:00Z'),
    }),
  );
  if (opciones.otorgado && opciones.activa) {
    plantilla = desenvolver(plantilla.habilitarSincronizacion(consentimiento));
    plantilla = desenvolver(plantilla.marcarSincronizada(new Date('2026-09-25T10:10:00Z')));
  }
  plantillas.declarar(plantilla);
  return new IdentidadBiometricaDesdeRepositorios(plantillas, consentimientos);
};

describe('IdentidadBiometricaDesdeRepositorios', () => {
  it('traduce la plantilla que la terminal reconoció a su TITULAR', async () => {
    const identidad = montar({ otorgado: true, activa: true });
    expect(await identidad.titularDePlantilla(COP, 'p-1')).toBe(TITULAR);
  });

  it('una plantilla que Next Control no gestiona no tiene titular', async () => {
    const identidad = montar({ otorgado: true, activa: true });
    expect(await identidad.titularDePlantilla(COP, 'p-que-no-existe')).toBeNull();
  });

  it('y de OTRA copropiedad tampoco: el aislamiento no se salta por una plantilla', async () => {
    const identidad = montar({ otorgado: true, activa: true });
    expect(
      await identidad.titularDePlantilla('10000000-0000-4000-8000-000000000002', 'p-1'),
    ).toBeNull();
  });

  it('consentimiento vigente + plantilla activa → se puede reconocer', async () => {
    const identidad = montar({ otorgado: true, activa: true });
    expect(await identidad.consentimientoVigente(COP, TITULAR, AHORA)).toBe(true);
  });

  it('consentimiento PENDIENTE → no se reconoce aunque exista plantilla', async () => {
    const identidad = montar({ otorgado: false, activa: false });
    expect(await identidad.consentimientoVigente(COP, TITULAR, AHORA)).toBe(false);
  });

  it('consentimiento vigente pero plantilla aún NO en la terminal → tampoco', async () => {
    // Sincronizar y reconocer son momentos distintos: sólo la activa cuenta.
    const identidad = montar({ otorgado: true, activa: false });
    expect(await identidad.consentimientoVigente(COP, TITULAR, AHORA)).toBe(false);
  });
});
