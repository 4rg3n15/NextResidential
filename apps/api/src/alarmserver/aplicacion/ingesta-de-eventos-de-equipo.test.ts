import { describe, expect, it, vi } from 'vitest';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId } from '@ncr/domain-core';
import { exito, ordenAceptada, ordenRechazada } from '@ncr/domain-core';
import type { EventoDeEquipo, PublicacionDeEquipo } from '@ncr/providers';
import type { EventoDeEquipoNuevo, RegistrarAcceso } from '../../eventos';
import { IngestorDeEquipos } from './ingestor-de-publicaciones';
import { CopropiedadDelEquipoPorRegistro } from './copropiedad-del-equipo';
import { filaDeEventoDeEquipo } from './fila-de-evento-de-equipo';
import { INTERPRETE_DE_HECHOS } from '../infraestructura/interprete-de-hechos';

/** 15-L · línea de tiempo (B), A1 y A4: nada se descarta, sólo los accesos van al
 * motor, y la apertura y «la cámara decidió» quedan a la vista. */
const COP = '10000000-0000-4000-8000-000000000001';
const EQUIPO = '90000000-0000-4000-8000-000000000001';

const base: EventoDeEquipo = {
  clase: 'equipo',
  placa: null,
  confianza: null,
  dispositivoId: EQUIPO,
  ocurridoEn: new Date('2026-09-27T15:00:00Z'),
  enVivo: true,
  referenciaDelEquipo: 'c1.s2002.t20260927T150000Z',
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
  personaId: null,
  esperaVeredicto: false,
  serieDelEquipo: null,
  esResultadoDeVerificacion: false,
  origenDeLlamada: null,
  unidadDeLlamada: null,
  edificioDeLlamada: null,
  tipo: 'puerta_forzada',
  titulo: 'Puerta forzada',
  codigo: { mayor: 5, menor: 27 },
  horaDelEquipo: '2026-09-27T10:00:00-05:00',
  carga: { eventType: 'AccessControllerEvent' },
};

const publicacion = (extra: Partial<EventoDeEquipo> = {}): PublicacionDeEquipo => ({
  evento: { ...base, ...extra },
  foto: null,
  recorte: null,
  transporte: 'escucha',
});

const montar = (
  opciones: {
    permitido?: boolean;
    orden?: 'aceptada' | 'rechazada';
    decideSolo?: boolean | null;
  } = {},
) => {
  const vivos: EventoDeEquipoNuevo[] = [];
  const historicos: EventoDeEquipoNuevo[] = [];
  const bitacora: Bitacora = { registrar: () => undefined };
  let n = 0;
  const ids: GeneradorDeId = { nuevo: () => `id-${String((n += 1))}` };
  const ejecutar = vi.fn(async () =>
    exito({
      eventoId: 'acceso-1',
      claveIdempotencia: 'clave',
      duplicado: false,
      permitido: opciones.permitido ?? true,
      alertaId: null,
      requiereConfirmacionHumana: false,
    }),
  );
  const accionar = vi.fn(async () =>
    opciones.orden === 'rechazada'
      ? ordenRechazada('el equipo decide por su cuenta: la plataforma no lo opera', 0)
      : ordenAceptada(40),
  );
  const almacen: AlmacenEvidencia = {
    guardar: async () => 'e',
    urlFirmada: async () => 'https://x.invalid',
  };
  const llamadas: unknown[] = [];
  const ingestor = new IngestorDeEquipos(
    { ejecutar } as unknown as RegistrarAcceso,
    { accionar },
    almacen,
    bitacora,
    ids,
    new CopropiedadDelEquipoPorRegistro({ copropiedadDe: async () => COP }, []),
    { titularDePlantilla: async () => null },
    { responderVerificacionRemota: async () => ({ aceptado: true, latenciaMs: 1 }) },
    { ahora: () => new Date() },
    { porUnidad: async () => null },
    { llamadaEntrante: async (l) => void llamadas.push(l) },
    INTERPRETE_DE_HECHOS,
    undefined,
    {
      eventosDeEquipo: {
        vivo: async (e) => {
          vivos.push(e);
          return null;
        },
        historico: (e) => void historicos.push(e),
      },
      control: { decideSolo: async () => opciones.decideSolo ?? false },
    },
  );
  return { ingestor, vivos, historicos, ejecutar, accionar, llamadas };
};

describe('Bloque B · lo que no es un acceso se guarda y no pasa por el motor', () => {
  it('una puerta forzada: una fila, con su tipo, su código y la hora del equipo', async () => {
    const { ingestor, vivos, ejecutar } = montar();
    expect((await ingestor.ingerir(publicacion())).registrado).toBe(true);
    expect(ejecutar).not.toHaveBeenCalled();
    expect(vivos).toEqual([
      expect.objectContaining({
        copropiedadId: COP,
        tipo: 'puerta_forzada',
        codigoMayor: 5,
        codigoMenor: 27,
        origen: 'equipo',
        horaDelEquipo: '2026-09-27T10:00:00-05:00',
      }),
    ]);
  });

  it('lo histórico va a la cola, sin motor y sin aviso', async () => {
    const { ingestor, vivos, historicos, ejecutar } = montar();
    await ingestor.ingerir(publicacion({ enVivo: false, clase: 'placa', placa: 'ABC123' }));
    expect(historicos).toHaveLength(1);
    expect(vivos).toEqual([]);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it.each([
    ['el timbre de la terminal (5/37)', { clase: 'timbre' as const, tipo: 'timbre' as const }],
    ['la llamada del videoportero', { clase: 'llamada' as const, tipo: 'llamada' as const }],
  ])('A3 · %s: evento Y aviso a la guardia virtual', async (_caso, extra) => {
    const { ingestor, vivos, llamadas, ejecutar } = montar();
    await ingestor.ingerir(publicacion(extra));
    expect(vivos.map((v) => v.tipo)).toEqual([extra.tipo]);
    expect(llamadas).toHaveLength(1);
    expect(ejecutar).not.toHaveBeenCalled();
  });

  it('una llamada que se cancela se guarda, pero no vuelve a avisar', async () => {
    const { ingestor, vivos, llamadas } = montar();
    await ingestor.ingerir(publicacion({ clase: 'llamada', tipo: 'llamada_cancelada' }));
    expect(vivos.map((v) => v.tipo)).toEqual(['llamada_cancelada']);
    expect(llamadas).toEqual([]);
  });

  it('un vehículo detectado SIN lectura se guarda y no se niega', async () => {
    const { ingestor, vivos, ejecutar } = montar();
    await ingestor.ingerir(publicacion({ clase: 'placa', placa: null, tipo: 'lectura_de_placa' }));
    expect(ejecutar).not.toHaveBeenCalled();
    expect(vivos.map((v) => v.tipo)).toEqual(['lectura_de_placa']);
  });
});

describe('A1 y A4 sobre una lectura de placa', () => {
  const placa = { clase: 'placa' as const, placa: 'ABC123', tipo: 'lectura_de_placa' as const };

  it('A1 · la apertura que ordenó el motor queda con su desenlace', async () => {
    const { ingestor, vivos } = montar({ permitido: true });
    await ingestor.ingerir(publicacion(placa));
    const apertura = vivos.find((v) => v.tipo === 'apertura_ordenada');
    expect(apertura).toMatchObject({
      origen: 'plataforma',
      eventoId: 'acceso-1',
      titulo: 'Apertura ordenada por la plataforma: el equipo la aceptó',
    });
  });

  it('A1 · y si el equipo la rechaza, el motivo va en palabras', async () => {
    const { ingestor, vivos } = montar({ permitido: true, orden: 'rechazada' });
    await ingestor.ingerir(publicacion(placa));
    expect(vivos.find((v) => v.tipo === 'apertura_ordenada')?.titulo).toMatch(
      /la rechazó — el equipo decide por su cuenta/,
    );
  });

  it('A4 · la cámara sin atestación: la lectura se registra y se MARCA', async () => {
    const { ingestor, vivos, ejecutar } = montar({ permitido: false, decideSolo: true });
    await ingestor.ingerir(publicacion(placa));
    await new Promise((listo) => setImmediate(listo));
    expect(ejecutar).toHaveBeenCalledTimes(1);
    expect(vivos.find((v) => v.tipo === 'la_camara_decidio')).toMatchObject({
      titulo: 'La cámara decidió por su cuenta',
      eventoId: 'acceso-1',
    });
  });

  it('A4 · también cuando el propio equipo declara que abrió él', async () => {
    const { ingestor, vivos } = montar({ permitido: false, decideSolo: false });
    await ingestor.ingerir(publicacion({ ...placa, quienAbrio: 'lista' }));
    await new Promise((listo) => setImmediate(listo));
    expect(vivos.some((v) => v.tipo === 'la_camara_decidio')).toBe(true);
  });

  it('A4 · con la cámara bajo control, no se marca nada', async () => {
    const { ingestor, vivos } = montar({ permitido: false, decideSolo: false });
    await ingestor.ingerir(publicacion(placa));
    await new Promise((listo) => setImmediate(listo));
    expect(vivos.some((v) => v.tipo === 'la_camara_decidio')).toBe(false);
  });
});

describe('la fila y su clave de idempotencia', () => {
  const ids: GeneradorDeId = { nuevo: () => 'unico' };

  it('la referencia del equipo hace la clave: un reenvío da la misma', () => {
    const a = filaDeEventoDeEquipo(base, COP, ids);
    const b = filaDeEventoDeEquipo(base, COP, { nuevo: () => 'otro' });
    expect(a.claveIdempotencia).toBe(b.claveIdempotencia);
    expect(a.claveIdempotencia).toContain('c1.s2002');
  });

  it('lo que añade la plataforma lleva sufijo y no choca con la del equipo', () => {
    const delEquipo = filaDeEventoDeEquipo(base, COP, ids);
    const suya = filaDeEventoDeEquipo(base, COP, ids, { origen: 'plataforma', sufijo: 'apertura' });
    expect(suya.claveIdempotencia).not.toBe(delEquipo.claveIdempotencia);
  });

  it('sin referencia, una única por recepción; con una inadmisible, compactada', () => {
    const sin = filaDeEventoDeEquipo({ ...base, referenciaDelEquipo: null }, COP, ids);
    expect(sin.claveIdempotencia).toContain('sinref.unico');
    const rara = filaDeEventoDeEquipo({ ...base, referenciaDelEquipo: 'ev #1/α' }, COP, ids);
    expect(rara.claveIdempotencia).toContain('r.ev1');
  });

  it('si el dominio no admite la clave, la fila entra con una única', () => {
    const fila = filaDeEventoDeEquipo({ ...base, dispositivoId: 'equipo con espacios' }, COP, ids);
    expect(fila.claveIdempotencia).toBe(`${COP}:equipo:unico`);
  });
});
