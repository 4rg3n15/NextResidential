import { describe, expect, it, vi } from 'vitest';
import { evaluarAcceso } from '@ncr/domain-core';
import type { Bitacora, ResultadoAcceso } from '@ncr/domain-core';
import { CargadorDeContextoPg } from './cargador-pg';
import { VersionDeReglasFija } from './cargador-conservador';
import type {
  LectorDeConsentimientoBiometrico,
  LectorDeUmbralDeConfianza,
  RepositorioAutorizaciones,
  RepositorioListaNegra,
  RepositorioVersionDeReglas,
  ResolutorDePlaca,
} from '../aplicacion/puertos';
import type { ResidenteResuelto, ResidentesPorPersona } from '../aplicacion/residentes-por-persona';

/**
 * 15-X · D1 · el ROSTRO de un residente, en el cargador de la nube.
 *
 * Antes: sin vehículo no había derecho, la vivienda quedaba en `null` y el motor
 * negaba con FALLO_TECNICO (`politica.vivienda`). Ahora el cargador resuelve al
 * residente por la persona del rostro —en la MISMA ronda de lecturas que la
 * placa, la lista negra, el umbral y la versión— y le antepone su derecho.
 * Sólo en un acceso facial: una placa no gana el derecho de la persona.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-10-07T14:00:00Z');
const bitacora: Bitacora = { registrar: () => undefined };

const RESIDENTE: ResidenteResuelto = {
  residenteId: 'r-1',
  personaId: 'p-1',
  viviendaId: 'v-1',
  viviendaActiva: true,
  registradoEn: new Date('2026-01-15T12:00:00Z'),
  bajaEn: null,
};

interface Dobles {
  readonly residente?: ResidenteResuelto | null;
  readonly consentimiento?: boolean;
  readonly vetadas?: readonly string[];
  readonly residentes?: ResidentesPorPersona;
  readonly versiones?: RepositorioVersionDeReglas;
}

const montar = (d: Dobles = {}) => {
  const residentes = d.residentes ?? { resolver: vi.fn(async () => d.residente ?? null) };
  const lector: LectorDeConsentimientoBiometrico = {
    consentimientoVigente: async () => d.consentimiento ?? true,
  };
  const cargador = new CargadorDeContextoPg(
    d.versiones ?? new VersionDeReglasFija(),
    { activasParaLectura: async () => [] } as unknown as RepositorioAutorizaciones,
    { resolver: async () => null } as ResolutorDePlaca,
    {
      activasDe: async () => (d.vetadas ?? []).map((personaId) => ({ personaId, placa: null })),
    } as unknown as RepositorioListaNegra,
    { umbralDeConfianzaPlaca: async () => 0.8 } as LectorDeUmbralDeConfianza,
    bitacora,
    undefined,
    lector,
    residentes,
  );
  return { cargador, residentes };
};

const rostro = (personaId: string | null) => ({
  copropiedadId: COP,
  dispositivoId: 'terminal-1',
  metodo: 'facial' as const,
  personaId,
  placaLeida: null,
  zonaId: null,
  confianza: 1,
});

const veredicto = (r: ResultadoAcceso): string => (r.permitido ? 'PERMITIDO' : r.motivo);

describe('15-X · D1 · el rostro del residente llega al motor con su derecho', () => {
  it('residente con consentimiento: PERMITIDO, con su vivienda y el derecho delante', async () => {
    const { cargador } = montar({ residente: RESIDENTE });
    const c = await cargador.cargar(rostro('p-1'), AHORA);
    expect(c.viviendaId).toBe('v-1');
    expect(c.viviendaActiva).toBe(true);
    expect(c.autorizaciones[0]?.id).toBe('residente:persona:r-1');
    expect(veredicto(evaluarAcceso(c))).toBe('PERMITIDO');
  });

  it('sin consentimiento vigente: SIN_CONSENTIMIENTO (RN-09)', async () => {
    const { cargador } = montar({ residente: RESIDENTE, consentimiento: false });
    expect(veredicto(evaluarAcceso(await cargador.cargar(rostro('p-1'), AHORA)))).toBe(
      'SIN_CONSENTIMIENTO',
    );
  });

  it('vetado: LISTA_NEGRA aunque viva allí y haya consentido (RN-06)', async () => {
    const { cargador } = montar({ residente: RESIDENTE, vetadas: ['p-1'] });
    expect(veredicto(evaluarAcceso(await cargador.cargar(rostro('p-1'), AHORA)))).toBe(
      'LISTA_NEGRA',
    );
  });

  it('de baja: VIGENCIA_EXPIRADA, el derecho venció con la baja (S-33)', async () => {
    const { cargador } = montar({
      residente: { ...RESIDENTE, viviendaActiva: false, bajaEn: new Date('2026-10-01T00:00:00Z') },
    });
    const c = await cargador.cargar(rostro('p-1'), AHORA);
    expect(c.viviendaId).toBe('v-1');
    expect(veredicto(evaluarAcceso(c))).toBe('VIGENCIA_EXPIRADA');
  });

  it('una persona que no es residente sigue sin vivienda: lo de antes', async () => {
    const { cargador } = montar({ residente: null });
    const c = await cargador.cargar(rostro('p-9'), AHORA);
    expect(c.viviendaId).toBeNull();
    expect(c.autorizaciones).toHaveLength(0);
  });

  it('una lectura de placa no pregunta por el residente ni gana su derecho', async () => {
    const { cargador, residentes } = montar({ residente: RESIDENTE });
    const c = await cargador.cargar(
      { ...rostro('p-1'), metodo: 'placa', placaLeida: 'ABC123' },
      AHORA,
    );
    expect(residentes.resolver).not.toHaveBeenCalled();
    expect(c.autorizaciones.some((a) => a.id.startsWith('residente:persona:'))).toBe(false);
  });

  it('se lee en la MISMA ronda que la versión: no espera a que las otras terminen', async () => {
    let preguntado = false;
    const residentes: ResidentesPorPersona = {
      resolver: async () => {
        preguntado = true;
        return RESIDENTE;
      },
    };
    const fija = new VersionDeReglasFija();
    // La versión sólo contesta después de que se haya preguntado por el
    // residente: si la lectura del residente fuera DESPUÉS de esta ronda, la
    // versión no contestaría nunca y la carga fallaría.
    const versiones: RepositorioVersionDeReglas = {
      vigenteDe: async (cop) => {
        for (let i = 0; i < 50 && !preguntado; i += 1) await new Promise((r) => setTimeout(r, 2));
        if (!preguntado) throw new Error('el residente se leyó después de la versión');
        return fija.vigenteDe(cop);
      },
    };
    const { cargador } = montar({ residentes, versiones });
    const c = await cargador.cargar(rostro('p-1'), AHORA);
    expect(c.viviendaId).toBe('v-1');
  });
});
