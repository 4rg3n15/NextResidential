import { describe, expect, it, vi } from 'vitest';
import type { Bitacora } from '@ncr/domain-core';
import { CargadorDeContextoPg } from './cargador-pg';
import { VersionDeReglasFija } from './cargador-conservador';
import type {
  RepositorioAutorizaciones,
  RepositorioListaNegra,
  ResolutorDePlaca,
  LectorDeUmbralDeConfianza,
  LectorDeConsentimientoBiometrico,
} from '../aplicacion/puertos';

/**
 * S-34, cerrado en la 15-E · el cargador ya no fija `consentimientoVigente:
 * false`: lo pregunta al lector, SÓLO en un acceso facial con persona, y ante
 * cualquier duda vuelve a `false`. Se prueba con dobles: lo que importa es a
 * quién se pregunta y qué pasa cuando no se puede.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const bitacora: Bitacora = { registrar: () => undefined };

const montar = (lector?: LectorDeConsentimientoBiometrico) =>
  new CargadorDeContextoPg(
    new VersionDeReglasFija(),
    { activasParaLectura: async () => [] } as unknown as RepositorioAutorizaciones,
    { resolver: async () => null } as ResolutorDePlaca,
    { activasDe: async () => [] } as unknown as RepositorioListaNegra,
    { umbralDeConfianzaPlaca: async () => 0.8 } as LectorDeUmbralDeConfianza,
    bitacora,
    undefined,
    lector,
  );

const solicitud = (metodo: 'facial' | 'placa', personaId: string | null) => ({
  copropiedadId: COP,
  dispositivoId: 'd-1',
  metodo,
  personaId,
  placaLeida: null,
  zonaId: null,
  confianza: 1,
});

describe('el consentimiento biométrico en el contexto del motor', () => {
  it('acceso facial con persona: pregunta al lector y entrega su respuesta', async () => {
    const lector = { consentimientoVigente: vi.fn(async () => true) };
    const contexto = await montar(lector).cargar(solicitud('facial', 'persona-1'), new Date());
    expect(contexto.consentimientoVigente).toBe(true);
    expect(lector.consentimientoVigente).toHaveBeenCalledWith(COP, 'persona-1', expect.any(Date));
  });

  it('acceso por placa: no pregunta; el motor no lo mira', async () => {
    const lector = { consentimientoVigente: vi.fn(async () => true) };
    const contexto = await montar(lector).cargar(solicitud('placa', 'persona-1'), new Date());
    expect(contexto.consentimientoVigente).toBe(false);
    expect(lector.consentimientoVigente).not.toHaveBeenCalled();
  });

  it('sin persona identificada no hay a quién consultar: false', async () => {
    const lector = { consentimientoVigente: vi.fn(async () => true) };
    const contexto = await montar(lector).cargar(solicitud('facial', null), new Date());
    expect(contexto.consentimientoVigente).toBe(false);
  });

  it('sin lector (la composición sin biometría) sigue siendo conservador', async () => {
    const contexto = await montar().cargar(solicitud('facial', 'persona-1'), new Date());
    expect(contexto.consentimientoVigente).toBe(false);
  });

  it('si el lector falla, se registra y queda en false: negar es la dirección segura (RN-09)', async () => {
    const lector = {
      consentimientoVigente: vi.fn(async () => {
        throw new Error('base caída');
      }),
    };
    const contexto = await montar(lector).cargar(solicitud('facial', 'persona-1'), new Date());
    expect(contexto.consentimientoVigente).toBe(false);
  });
});
