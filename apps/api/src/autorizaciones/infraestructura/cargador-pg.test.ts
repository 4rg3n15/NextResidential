import { describe, expect, it } from 'vitest';
import { Autorizacion, Vigencia, VersionDeReglas, evaluarAcceso } from '@ncr/domain-core';
import type { Bitacora } from '@ncr/domain-core';
import { CargadorDeContextoPg } from './cargador-pg';
import type {
  PlacaResuelta,
  RepositorioAutorizaciones,
  RepositorioListaNegra,
  SolicitudDeAcceso,
} from '../aplicacion/puertos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * EL CARGADOR, CON DOBLES: qué contexto arma con cada respuesta de los puertos
 *
 * La tabla de 9.1 corre contra la base (`test/cargador-contexto-pg.test.ts`).
 * Aquí se fija la lógica de composición sin base: qué vale `placaConocida`,
 * cuándo aparece el derecho sintético del residente, hasta cuándo rige y qué
 * pasa cuando un puerto falla. Es lo que hay que poder discutir leyendo.
 */

const COP = 'cop-1';
const AHORA = new Date('2026-09-23T12:00:00Z');
const bitacora: Bitacora = { registrar: () => undefined };
const versiones = { vigenteDe: async (c: string) => abrir(VersionDeReglas.crear(1, c)) };

function abrir<T>(r: { ok: boolean; valor?: T; error?: { detalle: string } }): T {
  if (!r.ok || r.valor === undefined) throw new Error(r.error?.detalle ?? 'dato inválido');
  return r.valor;
}

const solicitud = (p: Partial<SolicitudDeAcceso> = {}): SolicitudDeAcceso => ({
  copropiedadId: COP,
  dispositivoId: 'disp-1',
  metodo: 'placa',
  personaId: null,
  placaLeida: 'ABC123',
  zonaId: null,
  confianza: 0.95,
  ...p,
});

const vehiculo = (p: Partial<PlacaResuelta> = {}): PlacaResuelta => ({
  vehiculoId: 'veh-1',
  viviendaId: 'viv-1',
  viviendaActiva: true,
  viviendaDesactivadaEn: null,
  personaId: 'per-1',
  registradoEn: new Date('2026-01-01T00:00:00Z'),
  ...p,
});

const autorizacionDeVisitante = (desde: string, hasta: string): Autorizacion =>
  abrir(
    Autorizacion.crear({
      id: 'aut-1',
      copropiedadId: COP,
      viviendaId: 'viv-42',
      personaId: 'per-visitante',
      vigencia: abrir(Vigencia.crear(new Date(desde), new Date(hasta))),
    }),
  );

const montar = (mundo: {
  vehiculo?: PlacaResuelta | null;
  autorizaciones?: readonly Autorizacion[];
  vetoPlacas?: readonly string[];
  umbral?: number | null;
  listaNegraRota?: boolean;
}): CargadorDeContextoPg => {
  const autorizaciones: RepositorioAutorizaciones = {
    guardar: async () => undefined,
    porId: async () => null,
    vigentesDePersona: async () => [],
    activasParaLectura: async () => mundo.autorizaciones ?? [],
  };
  const listaNegra: RepositorioListaNegra = {
    crear: async () => undefined,
    porId: async () => null,
    levantar: async () => false,
    activasDe: async () => {
      if (mundo.listaNegraRota === true) throw new Error('la base no contesta');
      return (mundo.vetoPlacas ?? []).map((placa) => ({
        id: `ln-${placa}`,
        copropiedadId: COP,
        personaId: null,
        placa,
        motivo: 'prueba',
        creadaPor: 'admin',
        levantadaPor: null,
        levantadaEn: null,
      }));
    },
  };
  return new CargadorDeContextoPg(
    versiones,
    autorizaciones,
    { resolver: async () => mundo.vehiculo ?? null },
    listaNegra,
    { umbralDeConfianzaPlaca: async () => mundo.umbral ?? 0.8 },
    bitacora,
  );
};

describe('el derecho del residente entra al motor como una autorización', () => {
  it('un vehículo del padrón con vivienda activa: PERMITIDO', async () => {
    const contexto = await montar({ vehiculo: vehiculo() }).cargar(solicitud(), AHORA);
    expect(contexto.placaConocida).toBe(true);
    expect(contexto.viviendaId).toBe('viv-1');
    expect(contexto.viviendaActiva).toBe(true);
    expect(contexto.autorizaciones[0]?.id).toBe('residente:veh-1');
    expect(evaluarAcceso(contexto).permitido).toBe(true);
  });

  it('con la vivienda DE BAJA el derecho venció con la baja: se niega por vigencia, no por fallo', async () => {
    // RN-13 · una vivienda inactiva no genera accesos nuevos. El contrato no
    // tiene motivo «vivienda inactiva» (S-33): lo que ocurrió es que el derecho
    // del residente dejó de estar vigente, y así se dice.
    const contexto = await montar({
      vehiculo: vehiculo({
        viviendaActiva: false,
        viviendaDesactivadaEn: new Date('2026-06-01T00:00:00Z'),
      }),
    }).cargar(solicitud(), AHORA);
    const r = evaluarAcceso(contexto);
    expect(r.permitido).toBe(false);
    expect(r.permitido ? null : r.motivo).toBe('VIGENCIA_EXPIRADA');
    expect(r.reglaAplicada).toBe('politica.vigencia');
    expect(contexto.viviendaActiva).toBe(false);
  });
});

describe('placa conocida, placa desconocida y placa vetada', () => {
  it('una placa que no está en el padrón ni en ninguna autorización es DESCONOCIDA', async () => {
    const contexto = await montar({}).cargar(solicitud({ placaLeida: 'ZZZ999' }), AHORA);
    expect(contexto.placaConocida).toBe(false);
    expect(contexto.viviendaId).toBeNull();
    const r = evaluarAcceso(contexto);
    expect(r.permitido ? null : r.motivo).toBe('PLACA_DESCONOCIDA');
  });

  it('una placa con autorización de visitante VENCIDA es conocida, y se niega por vigencia', async () => {
    // Distinguirlas es el motivo de que el repositorio devuelva también las
    // vencidas: «nunca existió» y «existió y venció» son dos motivos distintos.
    const contexto = await montar({
      autorizaciones: [autorizacionDeVisitante('2026-09-01T00:00:00Z', '2026-09-02T00:00:00Z')],
    }).cargar(solicitud(), AHORA);
    expect(contexto.placaConocida).toBe(true);
    expect(contexto.viviendaId).toBe('viv-42');
    const r = evaluarAcceso(contexto);
    expect(r.permitido ? null : r.motivo).toBe('VIGENCIA_EXPIRADA');
  });

  it('LISTA_NEGRA manda sobre una autorización vigente (RN-06, CA-13)', async () => {
    const contexto = await montar({
      autorizaciones: [autorizacionDeVisitante('2026-09-23T00:00:00Z', '2026-09-24T00:00:00Z')],
      vetoPlacas: ['ABC123'],
    }).cargar(solicitud(), AHORA);
    const r = evaluarAcceso(contexto);
    expect(r.permitido ? null : r.motivo).toBe('LISTA_NEGRA');
  });

  it('la placa se normaliza con el objeto de valor antes de buscar', async () => {
    const contexto = await montar({ vehiculo: vehiculo() }).cargar(
      solicitud({ placaLeida: ' abc-123 ' }),
      AHORA,
    );
    expect(contexto.placaLeida).toBe('ABC123');
  });
});

describe('el umbral y la confianza', () => {
  it('el umbral sale de la copropiedad, y sin ella del contrato (0,80)', async () => {
    expect((await montar({ umbral: 0.9 }).cargar(solicitud(), AHORA)).umbralDeConfianza).toBe(0.9);
    expect((await montar({ umbral: null }).cargar(solicitud(), AHORA)).umbralDeConfianza).toBe(0.8);
  });

  it('una lectura dudosa NO se decide sola: queda para confirmación humana (CU-01, 3a)', async () => {
    const contexto = await montar({ vehiculo: vehiculo() }).cargar(
      solicitud({ confianza: 0.5 }),
      AHORA,
    );
    const r = evaluarAcceso(contexto);
    expect(r.permitido).toBe(true);
    expect(r.requiereConfirmacionHumana).toBe(true);
  });

  it('y por debajo de la mitad del umbral es INSUFICIENTE', async () => {
    const contexto = await montar({ vehiculo: vehiculo() }).cargar(
      solicitud({ confianza: 0.2 }),
      AHORA,
    );
    const r = evaluarAcceso(contexto);
    expect(r.permitido ? null : r.motivo).toBe('CONFIANZA_INSUFICIENTE');
  });
});

describe('cuando un puerto falla', () => {
  it('una lista negra que no contesta NO abre la puerta: se registra y se sigue con el resto', async () => {
    const contexto = await montar({ vehiculo: vehiculo(), listaNegraRota: true }).cargar(
      solicitud(),
      AHORA,
    );
    // El resto del contexto es real; lo que no se pudo leer es el veto.
    expect(contexto.placasEnListaNegra.size).toBe(0);
    expect(contexto.placaConocida).toBe(true);
  });
});
