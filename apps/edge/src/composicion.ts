/**
 * 15-Q · LA RAÍZ DE COMPOSICIÓN DEL EDGE EN SITIO (P-27 = B)
 *
 * Construye, sin arrancar nada, todo lo que `main.ts` pone en marcha: la caché
 * y la bandeja en SQLite, el cliente de la nube con la identidad del Edge, el
 * proveedor de equipos de `packages/providers` —el mismo de la nube, con los
 * equipos del `.env` local—, la contingencia que decide y acciona sin WAN, y
 * el manejador de las entradas locales. Sin temporizadores ni servidores: así
 * la prueba de la DoD compone el MISMO Edge y le pasa el tiempo y la red.
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

export type Registrar = (
  nivel: 'info' | 'aviso' | 'error',
  mensaje: string,
  contexto?: unknown,
) => void;

export interface ExtrasDeComposicion {
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
    registro: new RegistroEnMemoria(config.EDGE_EQUIPOS.map(aRegistrado)),
    fuente,
    ...(extras.peticionAEquipos === undefined ? {} : { peticion: extras.peticionAEquipos }),
  });
  const contingencia = new ContingenciaEnSitio(
    gateway,
    new DescargaDeReglas(nube, cache, new FeDeVidaSqlite(db), {
      copropiedadId: config.EDGE_COPROPIEDAD_ID,
      cadaSegundos: config.REGLAS_DESCARGA_SEGUNDOS,
    }),
    cache,
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
  fuente.fijarIngestor(contingencia);

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
      camaras: config.EDGE_EQUIPOS.flatMap((e) =>
        e.secretoAlarmServer === undefined
          ? []
          : [{ dispositivoId: e.dispositivoId, host: e.host, secreto: e.secretoAlarmServer }],
      ),
      ahora: () => reloj.ahora().getTime(),
      registrar: extras.registrar,
    },
  );

  /**
   * Q3 · las escuchas (alertStream o suscripción, según declare el equipo) de
   * la terminal y el videoportero. `escuchar` es idempotente en el proveedor:
   * rearmar sólo vuelve a abrir la que terminó. La cámara no se escucha: publica.
   */
  const rearmarEscuchas = async (): Promise<number> => {
    let activas = 0;
    for (const e of config.EDGE_EQUIPOS.filter((x) => x.tipo !== 'camara_lpr')) {
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
