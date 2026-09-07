import { describe, expect, it } from 'vitest';
import { Autorizacion } from './autorizacion';
import { Vigencia } from './vigencia';
import { PatronRecurrencia } from './patron-recurrencia';
import { esExito, esFallo } from '../compartido/resultado';

const AHORA = new Date('2026-09-08T14:00:00Z'); // martes 09:00 en Bogotá

const vigencia = (desde: string, hasta: string): Vigencia => {
  const r = Vigencia.crear(new Date(desde), new Date(hasta));
  if (!esExito(r)) throw new Error('vigencia inválida');
  return r.valor;
};

const patronMartes = (): PatronRecurrencia => {
  const r = PatronRecurrencia.crear({
    dias: [2],
    minutoInicio: 8 * 60,
    minutoFin: 12 * 60,
    desplazamientoUtcMinutos: -300,
  });
  if (!esExito(r)) throw new Error('patrón inválido');
  return r.valor;
};

const nueva = (extra: Partial<Parameters<typeof Autorizacion.crear>[0]> = {}): Autorizacion => {
  const r = Autorizacion.crear({
    id: 'aut-1',
    copropiedadId: 'cop-1',
    viviendaId: 'viv-1',
    personaId: 'per-1',
    vigencia: vigencia('2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z'),
    ...extra,
  });
  if (!esExito(r)) throw new Error('autorización de prueba inválida');
  return r.valor;
};

describe('agregado Autorizacion', () => {
  it('valida el máximo de acompañantes al construir (RN-05)', () => {
    expect(
      esFallo(
        Autorizacion.crear({
          id: 'a',
          copropiedadId: 'c',
          viviendaId: 'v',
          personaId: 'p',
          vigencia: vigencia('2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z'),
          maximoAcompanantes: -1,
        }),
      ),
    ).toBe(true);
    expect(
      esFallo(
        Autorizacion.crear({
          id: 'a',
          copropiedadId: 'c',
          viviendaId: 'v',
          personaId: 'p',
          vigencia: vigencia('2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z'),
          maximoAcompanantes: 51,
        }),
      ),
    ).toBe(true);
    expect(
      esFallo(
        Autorizacion.crear({
          id: 'a',
          copropiedadId: 'c',
          viviendaId: 'v',
          personaId: 'p',
          vigencia: vigencia('2026-09-08T00:00:00Z', '2026-09-09T00:00:00Z'),
          maximoAcompanantes: 2.5,
        }),
      ),
    ).toBe(true);
  });

  it('revocar exige motivo y es irreversible (RN-19)', () => {
    const a = nueva();
    expect(esFallo(a.revocar('  ', AHORA))).toBe(true);
    expect(a.estado).toBe('vigente');
    expect(esExito(a.revocar('  el residente canceló  ', AHORA))).toBe(true);
    expect(a.estado).toBe('revocada');
    expect(a.motivoRevocacion).toBe('el residente canceló');
    expect(a.revocadaEn?.getTime()).toBe(AHORA.getTime());
    expect(esFallo(a.revocar('otra vez', AHORA))).toBe(true);
  });

  it('revocada deja de estar vigente aunque la vigencia siga corriendo (RN-01)', () => {
    const a = nueva();
    expect(a.estaVigenteEn(AHORA)).toBe(true);
    a.revocar('sospecha', AHORA);
    expect(a.estaVigenteEn(AHORA)).toBe(false);
  });

  it('sin patrón aplica siempre dentro de la vigencia; con patrón, solo en su franja (RN-22)', () => {
    expect(nueva().aplicaElPatronEn(AHORA)).toBe(true);
    const rec = nueva({ patron: patronMartes() });
    expect(rec.esRecurrente).toBe(true);
    expect(rec.aplicaElPatronEn(AHORA)).toBe(true);
    expect(rec.aplicaElPatronEn(new Date('2026-09-08T20:00:00Z'))).toBe(false);
  });

  it('sin zonas declaradas no alcanza ninguna zona restringida (RN-14)', () => {
    expect(nueva().alcanzaZona('zona-piscina')).toBe(false);
    const conZona = nueva({ zonasPermitidas: ['zona-piscina'] });
    expect(conZona.alcanzaZona('zona-piscina')).toBe(true);
    expect(conZona.alcanzaZona('zona-gimnasio')).toBe(false);
    expect(conZona.zonasPermitidas).toEqual(['zona-piscina']);
  });

  it('los acompañantes se añaden solo a una autorización viva y sin duplicados (RN-05)', () => {
    const a = nueva({ maximoAcompanantes: 2 });
    expect(esFallo(a.agregarAcompanante({ personaId: 'per-1', nombre: 'Titular' }, AHORA))).toBe(
      true,
    );
    expect(esExito(a.agregarAcompanante({ personaId: 'per-2', nombre: 'Ana' }, AHORA))).toBe(true);
    expect(esFallo(a.agregarAcompanante({ personaId: 'per-2', nombre: 'Ana' }, AHORA))).toBe(true);
    expect(esExito(a.agregarAcompanante({ personaId: 'per-3', nombre: 'Luis' }, AHORA))).toBe(true);
    expect(esFallo(a.agregarAcompanante({ personaId: 'per-4', nombre: 'Eva' }, AHORA))).toBe(true);
    expect(a.acompanantes).toHaveLength(2);
  });

  it('no admite acompañantes si la vigencia expiró o la autorización fue revocada', () => {
    const expirada = nueva();
    const despues = new Date('2026-09-10T00:00:00Z');
    expect(esFallo(expirada.agregarAcompanante({ personaId: 'per-9', nombre: 'X' }, despues))).toBe(
      true,
    );

    const revocada = nueva();
    revocada.revocar('cancelada', AHORA);
    expect(esFallo(revocada.agregarAcompanante({ personaId: 'per-9', nombre: 'X' }, AHORA))).toBe(
      true,
    );
  });

  it('D-01 · el acompañante entra por identidad propia', () => {
    const a = nueva();
    a.agregarAcompanante({ personaId: 'per-2', nombre: 'Ana' }, AHORA);
    expect(a.cubreAPersona('per-1')).toBe(true);
    expect(a.cubreAPersona('per-2')).toBe(true);
    expect(a.cubreAPersona('per-3')).toBe(false);
  });
});
