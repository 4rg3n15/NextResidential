import { describe, expect, it, vi } from 'vitest';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId, Reloj } from '@ncr/domain-core';
import { exito, fallo, errorDominio, ordenAceptada } from '@ncr/domain-core';
import type { EventoDeEquipo, PublicacionDeEquipo, VeredictoRemoto } from '@ncr/providers';
import type { RegistrarAcceso } from '../../eventos';
import type { EquipoDeclarado } from '../../comun/equipos-de-alarm-server';
import { CONFIANZA_DE_ROSTRO_RECONOCIDO, IngestorDeEquipos } from './ingestor-de-publicaciones';

/**
 * A2 · EL PRINCIPIO RECTOR EN LA TERMINAL, EN UNA FRASE: la terminal reporta y
 * espera; el MISMO caso de uso que decide placas decide el rostro; y el
 * veredicto vuelve al equipo, que es quien abre. Aquí no se acciona ningún
 * relé: una segunda apertura abriría dos veces.
 */
const EQUIPO: EquipoDeclarado = {
  copropiedadId: '10000000-0000-4000-8000-000000000001',
  dispositivoId: 'terminal-1',
  secreto: 'x'.repeat(32),
  origenesPermitidos: ['origen'],
};
const TITULAR = '40000000-0000-4000-8000-000000000001';

const rostro = (extra: Partial<EventoDeEquipo> = {}): PublicacionDeEquipo => ({
  evento: {
    clase: 'rostro',
    placa: null,
    confianza: null,
    dispositivoId: 'terminal-1',
    ocurridoEn: new Date('2026-09-25T12:00:00Z'),
    enVivo: true,
    referenciaDelEquipo: 'ev-rostro-1',
    quienAbrio: null,
    tipoDePlaca: null,
    colorDePlaca: null,
    pais: null,
    carril: null,
    sentido: null,
    tipoDeVehiculo: null,
    tipoDeDeteccion: null,
    placaEstandar: null,
    recuadro: null,
    horaSinDesplazamiento: false,
    personaId: 'plantilla-77',
    esperaVeredicto: true,
    serieDelEquipo: 4711,
    esResultadoDeVerificacion: false,
    origenDeLlamada: null,
    unidadDeLlamada: null,
    edificioDeLlamada: null,
    ...extra,
  },
  foto: null,
  recorte: null,
  transporte: 'escucha',
});

const montar = (opciones: {
  permitido?: boolean;
  duplicado?: boolean;
  registroFalla?: boolean;
  titular?: string | null;
  respondedorFalla?: boolean;
}) => {
  const lineas: { nivel: string; mensaje: string; contexto: unknown }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje, contexto) => {
      lineas.push({ nivel, mensaje, contexto });
    },
  };
  let t = 1_000;
  const reloj: Reloj = { ahora: () => new Date((t += 250)) };
  const ids: GeneradorDeId = { nuevo: () => 'id-fijo' };
  const ejecutar = vi.fn(async () =>
    opciones.registroFalla === true
      ? fallo(errorDominio('REFERENCIA_INVALIDA', 'referencia inadmisible'))
      : exito({
          eventoId: 'ev-guardado',
          claveIdempotencia: 'clave',
          duplicado: opciones.duplicado ?? false,
          permitido: opciones.permitido ?? false,
          alertaId: null,
        }),
  );
  const accionar = vi.fn(async () => ordenAceptada(1));
  const veredictos: { dispositivoId: string; veredicto: VeredictoRemoto }[] = [];
  const respondedor = {
    responderVerificacionRemota: vi.fn(
      async (dispositivoId: string, veredicto: VeredictoRemoto) => {
        if (opciones.respondedorFalla === true) throw new Error('el equipo no contestó');
        veredictos.push({ dispositivoId, veredicto });
        return { aceptado: true, latenciaMs: 30 };
      },
    ),
  };
  const almacen: AlmacenEvidencia = {
    guardar: async () => 'evidencia-1',
    urlFirmada: async () => 'https://x.invalid',
  };
  const llamadas: LlamadaEntrante[] = [];
  const ingestor = new IngestorDeEquipos(
    { ejecutar } as unknown as RegistrarAcceso,
    { accionar },
    almacen,
    bitacora,
    ids,
    [EQUIPO],
    {
      titularDePlantilla: async () => (opciones.titular === undefined ? TITULAR : opciones.titular),
    },
    respondedor,
    reloj,
    // A4 · la vivienda de la llamada y el avisador, con dobles observables.
    {
      porUnidad: async (_cop: string, agrupacion: string | null, identificador: string) =>
        identificador === '305'
          ? {
              id: 'viv-305',
              identificador: `Apto 305${agrupacion === null ? '' : ` · ${agrupacion}`}`,
            }
          : null,
    },
    { llamadaEntrante: async (llamada) => void llamadas.push(llamada) },
  );
  return { ingestor, ejecutar, accionar, veredictos, lineas, respondedor, llamadas };
};

describe('A2 · el rostro que espera veredicto', () => {
  it('PERMITIDO: se registra a nombre del TITULAR, con método facial, y el veredicto vuelve como éxito', async () => {
    const { ingestor, ejecutar, veredictos, accionar } = montar({ permitido: true });
    const r = await ingestor.ingerir(rostro());
    expect(r.registrado).toBe(true);
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({
        copropiedadId: EQUIPO.copropiedadId,
        dispositivoId: 'terminal-1',
        metodo: 'facial',
        personaId: TITULAR,
        confianza: CONFIANZA_DE_ROSTRO_RECONOCIDO,
        referenciaExterna: 'ev-rostro-1',
      }),
      expect.any(String),
    );
    expect(veredictos).toEqual([
      {
        dispositivoId: 'terminal-1',
        veredicto: { serie: 4711, permitido: true, motivo: 'acceso permitido' },
      },
    ]);
    // Quien abre es la terminal al recibir el veredicto: el relé NO se toca.
    expect(accionar).not.toHaveBeenCalled();
  });

  it('NEGADO: hay evento igual (RN-02) y el veredicto vuelve como fallo', async () => {
    const { ingestor, ejecutar, veredictos } = montar({ permitido: false });
    await ingestor.ingerir(rostro());
    expect(ejecutar).toHaveBeenCalledOnce();
    expect(veredictos[0]?.veredicto.permitido).toBe(false);
  });

  it('DUPLICADO permitido: al equipo no se le vuelve a abrir', async () => {
    const { ingestor, veredictos } = montar({ permitido: true, duplicado: true });
    await ingestor.ingerir(rostro());
    expect(veredictos[0]?.veredicto).toMatchObject({ permitido: false, motivo: 'DUPLICADO' });
  });

  it('una plantilla que Next Control NO gestiona se registra sin persona y se marca como HALLAZGO', async () => {
    const { ingestor, ejecutar, lineas, veredictos } = montar({ permitido: false, titular: null });
    await ingestor.ingerir(rostro());
    expect(ejecutar).toHaveBeenCalledWith(
      expect.objectContaining({ personaId: null, metodo: 'facial' }),
      expect.any(String),
    );
    expect(lineas.some((l) => /HALLAZGO/.test(l.mensaje) && l.nivel === 'error')).toBe(true);
    expect(veredictos[0]?.veredicto.permitido).toBe(false);
  });

  it('mide y registra cuánto tardó el veredicto en ser aceptado', async () => {
    const { ingestor, lineas } = montar({ permitido: true });
    await ingestor.ingerir(rostro());
    const medida = lineas.find((l) => /veredicto devuelto/.test(l.mensaje));
    expect(medida).toBeDefined();
    const contexto = medida?.contexto as { respuestaTotalMs: number; latenciaDelEquipoMs: number };
    expect(contexto.respuestaTotalMs).toBeGreaterThan(0);
    expect(contexto.latenciaDelEquipoMs).toBe(30);
  });

  it('si el equipo no acepta el veredicto, el evento sigue en pie y se registra el fallo', async () => {
    const { ingestor, lineas } = montar({ permitido: true, respondedorFalla: true });
    const r = await ingestor.ingerir(rostro());
    expect(r.registrado).toBe(true);
    expect(lineas.some((l) => /no se pudo devolver el veredicto/.test(l.mensaje))).toBe(true);
  });

  it('si el hecho no se pudo registrar, al equipo se le niega con FALLO_TECNICO', async () => {
    const { ingestor, veredictos } = montar({ registroFalla: true });
    const r = await ingestor.ingerir(rostro());
    expect(r.registrado).toBe(false);
    expect(veredictos[0]?.veredicto).toMatchObject({ permitido: false, motivo: 'FALLO_TECNICO' });
  });
});

describe('A2 · lo que NO es una petición', () => {
  it('un remoteCheckResult es informativo: no se registra ni se contesta', async () => {
    const { ingestor, ejecutar, veredictos } = montar({ permitido: true });
    const r = await ingestor.ingerir(
      rostro({ esResultadoDeVerificacion: true, esperaVeredicto: false }),
    );
    expect(r.registrado).toBe(false);
    expect(ejecutar).not.toHaveBeenCalled();
    expect(veredictos).toHaveLength(0);
  });

  it('una terminal que decidió SOLA deja evento y aviso, y no recibe veredicto', async () => {
    const { ingestor, ejecutar, veredictos, lineas } = montar({ permitido: true });
    await ingestor.ingerir(rostro({ esperaVeredicto: false }));
    expect(ejecutar).toHaveBeenCalledOnce();
    expect(veredictos).toHaveLength(0);
    expect(lineas.some((l) => /decidió sola/.test(l.mensaje) && l.nivel === 'aviso')).toBe(true);
  });

  it('una llamada del videoportero no es un acceso', async () => {
    const { ingestor, ejecutar } = montar({});
    const r = await ingestor.ingerir(
      rostro({ clase: 'llamada', personaId: null, esperaVeredicto: false }),
    );
    expect(r.registrado).toBe(false);
    expect(ejecutar).not.toHaveBeenCalled();
  });
});

describe('A4 · la llamada del videoportero', () => {
  it('avisa a las consolas con la vivienda resuelta por unidad y edificio; no registra acceso', async () => {
    const { ingestor, ejecutar, llamadas } = montar({});
    const r = await ingestor.ingerir(
      rostro({
        clase: 'llamada',
        origenDeLlamada: 'edificio 2 · unidad 305',
        unidadDeLlamada: '305',
        edificioDeLlamada: '2',
        esperaVeredicto: false,
      }),
    );
    expect(r.registrado).toBe(false);
    expect(ejecutar).not.toHaveBeenCalled();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).toMatchObject({
      clase: 'llamada',
      viviendaId: 'viv-305',
      vivienda: 'Apto 305 · 2',
      origen: 'edificio 2 · unidad 305',
    });
  });

  it('sin unidad reconocida avisa igual, con la vivienda en null: la llamada no se pierde', async () => {
    const { ingestor, llamadas } = montar({});
    await ingestor.ingerir(
      rostro({ clase: 'timbre', unidadDeLlamada: '999', esperaVeredicto: false }),
    );
    expect(llamadas[0]).toMatchObject({ clase: 'timbre', viviendaId: null, vivienda: '999' });
  });
});
