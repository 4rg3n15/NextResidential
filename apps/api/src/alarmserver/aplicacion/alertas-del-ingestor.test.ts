import { describe, expect, it, vi } from 'vitest';
import type { AlmacenEvidencia, Bitacora, GeneradorDeId } from '@ncr/domain-core';
import { exito, ordenAceptada } from '@ncr/domain-core';
import type { EventoDeEquipo, PublicacionDeEquipo } from '@ncr/providers';
import type { AlertaDeEquipoNueva, EventoDeEquipoNuevo, RegistrarAcceso } from '../../eventos';
import { IngestorDeEquipos } from './ingestor-de-publicaciones';
import { CopropiedadDelEquipoPorRegistro } from './copropiedad-del-equipo';
import { INTERPRETE_DE_HECHOS } from '../infraestructura/interprete-de-hechos';

/**
 * E5 (15-M) · las CONDICIONES de un equipo: la cámara que decide sola es UNA alerta
 * por cámara; el reloj desviado, UNA con el valor (la latencia nunca sale de la
 * hora del equipo); el volcado histórico no deja una línea por evento.
 */
const COP = '10000000-0000-4000-8000-000000000001';
const CAMARA = '90000000-0000-4000-8000-000000000001';
const AHORA = new Date('2026-09-29T10:00:00Z');

const base: EventoDeEquipo = {
  clase: 'placa',
  placa: 'ABC123',
  confianza: 0.95,
  dispositivoId: CAMARA,
  ocurridoEn: AHORA,
  enVivo: true,
  referenciaDelEquipo: 'ref-1',
  quienAbrio: null,
  tipoDePlaca: null,
  pais: null,
  carril: null,
  personaId: null,
  serieDelEquipo: null,
  esperaVeredicto: false,
  placaEstandar: null,
  esResultadoDeVerificacion: false,
  horaSinDesplazamiento: false,
  origenDeLlamada: null,
  unidadDeLlamada: null,
  edificioDeLlamada: null,
  tipo: 'placa',
  titulo: 'Placa leída',
  codigo: null,
  horaDelEquipo: null,
  carga: {},
};

const publicacion = (extra: Partial<EventoDeEquipo> = {}): PublicacionDeEquipo => ({
  evento: { ...base, ...extra },
  foto: null,
  recorte: null,
  transporte: 'alarm-server',
});

const montar = (opciones: { decideSolo?: boolean; conAlertas?: boolean } = {}) => {
  const vivos: EventoDeEquipoNuevo[] = [];
  const lineas: { nivel: string; mensaje: string }[] = [];
  const bitacora: Bitacora = {
    registrar: (nivel, mensaje) => void lineas.push({ nivel, mensaje }),
  };
  let n = 0;
  const ids: GeneradorDeId = { nuevo: () => `id-${String((n += 1))}` };
  const pedidas: AlertaDeEquipoNueva[] = [];
  const abiertas = new Set<string>();
  const alertas = {
    ejecutar: async (nueva: AlertaDeEquipoNueva) => {
      pedidas.push(nueva);
      const clave = `${nueva.dispositivoId}|${nueva.clave}`;
      if (abiertas.has(clave)) return { alerta: null, motivo: 'ya abierta' };
      abiertas.add(clave);
      return { alerta: { id: 'a' } as never, motivo: 'primera' };
    },
  };
  const ingestor = new IngestorDeEquipos(
    {
      ejecutar: vi.fn(async () =>
        exito({
          eventoId: 'acceso-1',
          claveIdempotencia: 'clave',
          duplicado: false,
          permitido: true,
          alertaId: null,
          requiereConfirmacionHumana: false,
        }),
      ),
    } as unknown as RegistrarAcceso,
    { accionar: async () => ordenAceptada(40) },
    { guardar: async () => 'e', urlFirmada: async () => 'https://x.invalid' } as AlmacenEvidencia,
    bitacora,
    ids,
    new CopropiedadDelEquipoPorRegistro({ copropiedadDe: async () => COP }, []),
    { titularDePlantilla: async () => null },
    { responderVerificacionRemota: async () => ({ aceptado: true, latenciaMs: 1 }) },
    { ahora: () => AHORA },
    { porUnidad: async () => null },
    { llamadaEntrante: async () => undefined },
    INTERPRETE_DE_HECHOS,
    undefined,
    {
      eventosDeEquipo: {
        vivo: async (e) => {
          vivos.push(e);
          return null;
        },
        historico: () => undefined,
      },
      control: { decideSolo: async () => opciones.decideSolo ?? false },
      ...(opciones.conAlertas === false ? {} : { alertas, desvioDeRelojMs: 30_000 }),
    },
  );
  const esperarMarcas = () => new Promise((listo) => setTimeout(listo, 5));
  return { ingestor, vivos, lineas, pedidas, esperarMarcas };
};

describe('E5 · la cámara que decide sola: UNA alerta por cámara', () => {
  it('diez lecturas → una alerta persistente pedida diez veces, abierta una, y UNA constancia', async () => {
    const { ingestor, vivos, pedidas, esperarMarcas } = montar({ decideSolo: true });
    for (let i = 0; i < 10; i += 1) {
      await ingestor.ingerir(publicacion({ referenciaDelEquipo: `ref-${String(i)}` }));
    }
    await esperarMarcas();
    const deCamara = pedidas.filter((p) => p.clave === 'camara_decide_sola');
    expect(deCamara.length).toBe(10);
    expect(deCamara[0]).toMatchObject({
      dispositivoId: CAMARA,
      tipo: 'acceso_dudoso',
      severidad: 'alta',
      persistente: true,
    });
    expect(vivos.filter((v) => v.tipo === 'la_camara_decidio').length).toBe(1);
  });

  it('sin el puerto de alertas (dobles antiguos) se conserva la constancia por lectura', async () => {
    const { ingestor, vivos, esperarMarcas } = montar({ decideSolo: true, conAlertas: false });
    await ingestor.ingerir(publicacion({ referenciaDelEquipo: 'a' }));
    await ingestor.ingerir(publicacion({ referenciaDelEquipo: 'b' }));
    await esperarMarcas();
    expect(vivos.filter((v) => v.tipo === 'la_camara_decidio').length).toBe(2);
  });
});

describe('E5 · el reloj del equipo desviado se avisa una vez, con el valor', () => {
  it('53 s adelantado → alerta persistente con «53 s adelantado»; 5 s → nada', async () => {
    const { ingestor, pedidas, esperarMarcas } = montar();
    await ingestor.ingerir(publicacion({ ocurridoEn: new Date(AHORA.getTime() + 53_000) }));
    await ingestor.ingerir(
      publicacion({ ocurridoEn: new Date(AHORA.getTime() + 5_000), referenciaDelEquipo: 'r2' }),
    );
    await esperarMarcas();
    const reloj = pedidas.filter((p) => p.clave === 'reloj_desviado');
    expect(reloj.length).toBe(1);
    expect(reloj[0]?.notas).toMatch(/53 s adelantado/);
    expect(reloj[0]?.persistente).toBe(true);
  });

  it('una hora sin desplazamiento no se compara: ya se avisa aparte y se usa la recepción', async () => {
    const { ingestor, pedidas, esperarMarcas } = montar();
    await ingestor.ingerir(
      publicacion({
        ocurridoEn: new Date(AHORA.getTime() + 3_600_000),
        horaSinDesplazamiento: true,
      }),
    );
    await esperarMarcas();
    expect(pedidas.filter((p) => p.clave === 'reloj_desviado')).toEqual([]);
  });
});

describe('E5 · el volcado histórico no deja una línea por evento', () => {
  it('cien eventos `enVivo=false` → cero líneas «evento de equipo»; uno vivo → una', async () => {
    const { ingestor, lineas } = montar();
    for (let i = 0; i < 100; i += 1) {
      await ingestor.ingerir(
        publicacion({
          enVivo: false,
          clase: 'equipo',
          placa: null,
          referenciaDelEquipo: `h-${String(i)}`,
        }),
      );
    }
    expect(lineas.filter((l) => l.mensaje === 'evento de equipo').length).toBe(0);
    await ingestor.ingerir(
      publicacion({ clase: 'equipo', placa: null, referenciaDelEquipo: 'vivo' }),
    );
    expect(lineas.filter((l) => l.mensaje === 'evento de equipo').length).toBe(1);
  });
});
