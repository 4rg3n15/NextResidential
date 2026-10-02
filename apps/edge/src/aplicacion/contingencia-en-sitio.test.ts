import { describe, expect, it } from 'vitest';
import type { EventoDeEquipo, PublicacionDeEquipo } from '@ncr/providers';
import { DatabaseSync } from '../infraestructura/sqlite/motor';
import { ESQUEMA } from '../infraestructura/sqlite/esquema';
import { BandejaSqlite } from '../infraestructura/sqlite/bandeja-sqlite';
import { CacheDeReglasSqlite } from '../infraestructura/sqlite/cache-de-reglas';
import { FeDeVidaSqlite } from '../infraestructura/sqlite/fe-de-vida';
import { MemoriaDeAccesosSqlite } from '../infraestructura/sqlite/memoria-de-accesos';
import { COP, PLANTILLA, instantaneaDePrueba } from '../../test/banco-de-sitio';
import { ContingenciaEnSitio } from './contingencia-en-sitio';
import type { AccionadorLocal } from './contingencia-en-sitio';
import { DecidirLocalmente } from './decidir-localmente';
import { DescargaDeReglas } from './descarga-de-reglas';
import { Gateway } from './gateway';
import { Reconciliacion } from './reconciliacion';
import type { Contingencia } from '../configuracion/esquema';

/**
 * 15-Q · P-27 = B, en frío: cuándo pregunta a la nube, qué acciona y qué hace
 * cuando el equipo no contesta. Lo de los equipos simulados está en
 * `test/edge-en-sitio.test.ts`; aquí, las ramas que allí no se alcanzan.
 */
const evento = (extra: Partial<EventoDeEquipo>): PublicacionDeEquipo => ({
  evento: {
    clase: 'rostro',
    placa: null,
    confianza: null,
    dispositivoId: 'terminal-1',
    ocurridoEn: new Date(),
    enVivo: true,
    referenciaDelEquipo: null,
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
    personaId: PLANTILLA,
    esperaVeredicto: true,
    serieDelEquipo: 77,
    esResultadoDeVerificacion: false,
    origenDeLlamada: null,
    unidadDeLlamada: null,
    edificioDeLlamada: null,
    tipo: 'rostro_reconocido',
    titulo: 'Rostro reconocido',
    codigo: null,
    horaDelEquipo: null,
    carga: {},
    ...extra,
  },
  foto: null,
  recorte: null,
  transporte: 'escucha',
});

const montar = (opciones: {
  nube: boolean;
  conCache?: boolean;
  contingencia?: Contingencia;
  accionador?: Partial<AccionadorLocal>;
}) => {
  const db = new DatabaseSync(':memory:');
  db.exec(ESQUEMA);
  const bandeja = new BandejaSqlite(db);
  const cache = new CacheDeReglasSqlite(db);
  if (opciones.conCache !== false) cache.guardar(instantaneaDePrueba(1));
  const sonda = { hayEnlace: async () => opciones.nube };
  const nube = { reconciliar: async () => [], descargarReglas: async () => null };
  const gateway = new Gateway(
    new DecidirLocalmente(cache, {
      copropiedadId: COP,
      contingencia: opciones.contingencia ?? 'denegar',
      cacheObsoletaMinutos: 1440,
    }),
    bandeja,
    sonda,
    new Reconciliacion(bandeja, nube, { lote: 10, intentosMaximos: 3, backoffBaseMs: 1 }),
    { copropiedadId: COP, gatewayId: 'edge', umbrales: { sondasParaCaer: 1, sondasParaVolver: 1 } },
  );
  const veredictos: { permitido: boolean }[] = [];
  const accionador: AccionadorLocal = {
    abrir: async () => ({ estado: 'aceptada', latenciaMs: 5 }),
    responderVeredicto: async (_d, v) => {
      veredictos.push(v);
      return { estado: 'aceptada', latenciaMs: 5 };
    },
    ...opciones.accionador,
  };
  const contingencia = new ContingenciaEnSitio(
    gateway,
    new DescargaDeReglas(nube, cache, new FeDeVidaSqlite(db), {
      copropiedadId: COP,
      cadaSegundos: 60,
    }),
    cache,
    sonda,
    accionador,
    new MemoriaDeAccesosSqlite(db),
    { copropiedadId: COP },
  );
  return { contingencia, bandeja, veredictos };
};

describe('ContingenciaEnSitio (15-Q, P-27 = B)', () => {
  it('recién arrancado (sin tics) pregunta a la nube; si contesta, no hace nada', async () => {
    const { contingencia, bandeja } = montar({ nube: true });
    expect(await contingencia.ingerir(evento({}))).toEqual({
      registrado: false,
      motivo: 'la nube lo atiende (P-27 B)',
    });
    expect(bandeja.cuantosPendientes()).toBe(0);
    expect(contingencia.estado()).toMatchObject({ tics: 0, confirmadoSinNube: false });
  });

  it('lo que no es un acceso (una puerta, un histórico) no pasa por el motor', async () => {
    const { contingencia } = montar({ nube: false });
    expect(await contingencia.ingerir(evento({ clase: 'equipo' }))).toMatchObject({
      motivo: 'no es un acceso',
    });
  });

  it('sin nube: el rostro conocido recibe «abrir»; uno de plantilla desconocida, «negar»', async () => {
    const { contingencia, veredictos } = montar({ nube: false });
    await contingencia.tic(new Date());
    expect(contingencia.estado().confirmadoSinNube).toBe(true);
    await contingencia.ingerir(evento({}));
    await contingencia.ingerir(evento({ personaId: 'ajena', serieDelEquipo: 78 }));
    expect(veredictos.map((v) => v.permitido)).toEqual([true, false]);
  });

  it('P-28 · «escalar» sin caché NO abre: la terminal recibe «negar»', async () => {
    const { contingencia, veredictos } = montar({
      nube: false,
      conCache: false,
      contingencia: 'escalar',
    });
    await contingencia.tic(new Date());
    await contingencia.ingerir(evento({}));
    expect(veredictos).toEqual([expect.objectContaining({ permitido: false })]);
  });

  it('una terminal que decide sola (no espera veredicto) no recibe nada', async () => {
    const { contingencia, veredictos, bandeja } = montar({ nube: false });
    await contingencia.tic(new Date());
    await contingencia.ingerir(evento({ esperaVeredicto: false }));
    expect(veredictos).toEqual([]);
    expect(bandeja.cuantosPendientes()).toBe(1);
  });

  it('si el equipo no contesta, queda escrito como inalcanzable y el acceso sigue en la bandeja', async () => {
    const { contingencia, bandeja } = montar({
      nube: false,
      accionador: {
        abrir: async () => {
          throw new Error('equipo caído');
        },
      },
    });
    await contingencia.tic(new Date());
    await contingencia.ingerir(
      evento({ clase: 'placa', placa: 'ABC123', personaId: null, confianza: 95 }),
    );
    const cuerpo = JSON.parse(bandeja.pendientes(new Date(), 5)[0]?.cuerpo ?? '{}');
    expect(cuerpo.accionamiento).toMatchObject({
      tipo: 'apertura',
      estado: 'inalcanzable',
      motivo: 'equipo caído',
    });
  });
});
