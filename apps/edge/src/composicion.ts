/**
 * 15-Q · RAÍZ DE COMPOSICIÓN DEL EDGE EN SITIO; la DoD compone el MISMO Edge con su tiempo
 * y su red. 15-Q2 · con puente, `ExtrasDelPuente` cambia el registro, la sonda y el ingestor.
 */
import type { Reloj } from '@ncr/domain-core';
import {
  FuenteDePlacas,
  RegistroEnMemoria,
  crearProveedorDeEquipos,
  hechoDeAccesoDe,
} from '@ncr/providers';
import type { EquipoRegistrado, ProveedorDeEquipos } from '@ncr/providers';
import type { ConfiguracionDeSitio, EquipoDelEdge } from './configuracion/esquema-de-sitio';
import { ContingenciaEnSitio } from './aplicacion/contingencia-en-sitio';
import { DecidirLocalmente } from './aplicacion/decidir-localmente';
import { DescargaDeReglas } from './aplicacion/descarga-de-reglas';
import { Gateway } from './aplicacion/gateway';
import { Reconciliacion } from './aplicacion/reconciliacion';
import { ClienteHttpDeNube, SondaHttp } from './infraestructura/api/cliente-de-nube';
import { AccionadorPorProveedor } from './infraestructura/equipos/accionador-por-proveedor';
import { crearManejador } from './infraestructura/http/servidor-local';
import { abrirBase } from './infraestructura/sqlite/esquema';
import { BandejaSqlite } from './infraestructura/sqlite/bandeja-sqlite';
import { CacheDeReglasSqlite } from './infraestructura/sqlite/cache-de-reglas';
import { FeDeVidaSqlite } from './infraestructura/sqlite/fe-de-vida';
import { MemoriaDeAccesosSqlite } from './infraestructura/sqlite/memoria-de-accesos';
import type { ExtrasDelPuente } from './extras-del-puente';
import { cuarentenaConConstancia } from './infraestructura/sqlite/cuarentena-sqlite';

export type Registrar = (
  nivel: 'info' | 'aviso' | 'error',
  mensaje: string,
  contexto?: unknown,
) => void;

export interface ExtrasDeComposicion extends ExtrasDelPuente {
  readonly registrar: Registrar;
  /** Hacia la nube. En las pruebas, el corte de WAN se simula aquí. */
  readonly transporteDeNube?: typeof fetch;
  /** Hacia los equipos. En las pruebas, los simulados de `providers`. */
  readonly peticionAEquipos?: typeof fetch;
  readonly reloj?: Reloj;
}

const aRegistrado = (e: EquipoDelEdge): EquipoRegistrado => ({
  dispositivoId: e.dispositivoId,
  tipo: e.tipo,
  host: e.host,
  puerto: e.puerto,
  protocolo: e.protocolo,
  usuario: e.usuario,
  clave: e.clave,
  ...(e.canalBarrera === undefined ? {} : { canalBarrera: e.canalBarrera }),
  ...(e.numeroDePuerta === undefined ? {} : { numeroDePuerta: e.numeroDePuerta }),
});

export const componerEdge = (config: ConfiguracionDeSitio, extras: ExtrasDeComposicion) => {
  const reloj: Reloj = extras.reloj ?? { ahora: () => new Date() };
  const db = abrirBase(config.SQLITE_PATH);
  const bandeja = new BandejaSqlite(db);
  const cache = new CacheDeReglasSqlite(db);
  const transporte = extras.transporteDeNube ?? fetch;
  const nube = new ClienteHttpDeNube({
    urlBase: config.NEXT_CONTROL_API_URL,
    secreto: config.EDGE_INGESTA_SECRETO,
    copropiedadId: config.EDGE_COPROPIEDAD_ID,
    gatewayId: config.EDGE_GATEWAY_ID,
    transporte,
    ahora: () => reloj.ahora(),
  });
  const gateway = new Gateway(
    new DecidirLocalmente(cache, {
      copropiedadId: config.EDGE_COPROPIEDAD_ID,
      contingencia: config.CONTINGENCIA_SIN_REGLA,
      cacheObsoletaMinutos: config.CACHE_OBSOLETA_MINUTOS,
    }),
    bandeja,
    new SondaHttp(config.NEXT_CONTROL_API_URL, transporte),
    new Reconciliacion(bandeja, nube, {
      lote: config.RECONCILIACION_LOTE,
      intentosMaximos: config.RECONCILIACION_INTENTOS,
      backoffBaseMs: config.RECONCILIACION_BACKOFF_MS,
      cuarentena: cuarentenaConConstancia(db, extras.registrar), // E6 (15-R) · P-31
    }),
    {
      copropiedadId: config.EDGE_COPROPIEDAD_ID,
      gatewayId: config.EDGE_GATEWAY_ID,
      umbrales: {
        sondasParaCaer: config.SONDAS_PARA_CAER,
        sondasParaVolver: config.SONDAS_PARA_VOLVER,
      },
    },
  );

  const fuente = new FuenteDePlacas();
  const proveedor: ProveedorDeEquipos = crearProveedorDeEquipos({
    clase: 'hikvision', // kpi-11-exento: en sitio, los equipos reales; las pruebas inyectan `peticion`
    reloj,
    registro: extras.registro?.(db) ?? new RegistroEnMemoria(config.EDGE_EQUIPOS.map(aRegistrado)),
    fuente,
    ...(extras.peticionAEquipos === undefined ? {} : { peticion: extras.peticionAEquipos }),
    ...(extras.audioDelEquipo === undefined ? {} : { audioDelEquipo: extras.audioDelEquipo }),
  });
  const contingencia = new ContingenciaEnSitio(
    gateway,
    new DescargaDeReglas(nube, cache, new FeDeVidaSqlite(db), {
      copropiedadId: config.EDGE_COPROPIEDAD_ID,
      cadaSegundos: config.REGLAS_DESCARGA_SEGUNDOS,
    }),
    cache,
    extras.sondaInmediata ??
      new SondaHttp(config.NEXT_CONTROL_API_URL, transporte, config.SONDA_POR_EVENTO_MS),
    new AccionadorPorProveedor(proveedor, config.EDGE_SERVICE_USER_ID),
    new MemoriaDeAccesosSqlite(db),
    {
      copropiedadId: config.EDGE_COPROPIEDAD_ID,
      interpretar: hechoDeAccesoDe,
      ahora: () => reloj.ahora(),
      registrar: extras.registrar,
    },
  );
  fuente.fijarIngestor(extras.envolverIngestor?.(contingencia) ?? contingencia);

  const manejador = crearManejador(
    {
      hecho: (h) => gateway.alRecibirHecho(h),
      estado: () => ({
        ...contingencia.estado(),
        versionDeReglas: cache.vigente(config.EDGE_COPROPIEDAD_ID)?.version ?? null,
        pendientes: bandeja.cuantosPendientes(),
      }),
      publicar: (p) => fuente.publicar(p),
    },
    {
      secretoLocal: config.EDGE_LOCAL_SECRETO,
      limitePorMinuto: config.EDGE_LIMITE_POR_MINUTO,
      camaras:
        extras.camaras ??
        config.EDGE_EQUIPOS.flatMap((e) =>
          e.secretoAlarmServer === undefined
            ? []
            : [{ dispositivoId: e.dispositivoId, host: e.host, secreto: e.secretoAlarmServer }],
        ),
      ahora: () => reloj.ahora().getTime(),
      registrar: extras.registrar,
    },
  );

  /** Q3 · terminal y videoportero (la cámara publica): rearmar sólo reabre la que terminó. */
  const rearmarEscuchas = async (): Promise<number> => {
    let activas = 0;
    const equipos = extras.equipos?.() ?? config.EDGE_EQUIPOS;
    for (const e of equipos.filter((x) => x.tipo !== 'camara_lpr')) {
      try {
        const escucha = await proveedor.escuchar(e.dispositivoId);
        if (escucha.transporte !== 'ninguna') activas += 1;
      } catch (error) {
        extras.registrar('aviso', 'no se pudo abrir la escucha de un equipo', {
          dispositivoId: e.dispositivoId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return activas;
  };

  return {
    db,
    bandeja,
    cache,
    gateway,
    contingencia,
    fuente,
    proveedor,
    manejador,
    rearmarEscuchas,
  };
};

export type EdgeCompuesto = ReturnType<typeof componerEdge>;
