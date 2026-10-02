/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 15-Q · Q7 · `pnpm sitio:edge` — EL EDGE, COMPROBADO ANTES DE CONFIAR EN ÉL
 *
 * Un gateway mal configurado no se nota con WAN: la nube decide y todo abre.
 * Se nota en el corte, que es justo cuando nadie está mirando. Este diagnóstico
 * hace las preguntas del corte ANTES del corte, con el MISMO código que arranca
 * el gateway (validador, cliente firmado, diagnóstico de `providers`, SQLite):
 *
 *   1 · ¿la interfaz de escucha es de este equipo?
 *   2 · ¿la nube está lista y el reloj coincide? (las firmas llevan marca)
 *   3 · ¿la API acepta ESTA credencial y entrega reglas íntegras de ESTA copropiedad?
 *   4 · ¿cada equipo contesta, con su credencial y en hora? ¿la cámara reporta sin decidir?
 *   5 · ¿el gateway en marcha contesta en esa interfaz, con ese secreto local?
 *   6 · ¿qué hay en la base local? (reglas, su edad, accesos sin reconciliar)
 *
 * Es de SÓLO LECTURA: la descarga no se guarda y ningún equipo se acciona.
 * Nunca imprime una IP, un usuario ni una clave (RN-21): equipos por su UUID.
 *
 * Salida: 0 sin fallos · 1 algún FALLO · 2 configuración incompleta.
 * ═════════════════════════════════════════════════════════════════════════════
 */
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { DESVIO_TOLERABLE_SEGUNDOS, diagnosticarEquipo } from '@ncr/providers';
import type { FamiliaDiagnosticada } from '@ncr/providers';
import { cargarConfiguracionDeSitio } from './configuracion/esquema-de-sitio';
import type { ConfiguracionDeSitio, EquipoDelEdge } from './configuracion/esquema-de-sitio';
import { hashDelContenido } from './aplicacion/descarga-de-reglas';
import { gatewayEnMarcha } from './diagnostico-local';
import type { InstantaneaDeReglas } from './aplicacion/instantanea-de-reglas';
import { ClienteHttpDeNube } from './infraestructura/api/cliente-de-nube';
import { abrirBase } from './infraestructura/sqlite/esquema';
import { BandejaSqlite } from './infraestructura/sqlite/bandeja-sqlite';
import { CacheDeReglasSqlite } from './infraestructura/sqlite/cache-de-reglas';

export type Estado = 'OK' | 'AVISO' | 'FALLO';

export interface Paso {
  readonly paso: string;
  readonly estado: Estado;
  readonly detalle: string;
}

export interface DependenciasDelDiagnostico {
  readonly transporteDeNube?: typeof fetch;
  readonly peticionAEquipos?: typeof fetch;
  /** Hacia el propio gateway en marcha (`GET /estado` firmado). */
  readonly transporteLocal?: typeof fetch;
  readonly interfaces?: () => readonly string[];
  readonly ahora?: () => Date;
}

const FAMILIA: Readonly<Record<EquipoDelEdge['tipo'], FamiliaDiagnosticada>> = {
  camara_lpr: 'camara',
  terminal_facial: 'terminal',
  intercom: 'videoportero',
};

const paso = (nombre: string, estado: Estado, detalle: string): Paso => ({
  paso: nombre,
  estado,
  detalle,
});

const ipsLocales = (): string[] =>
  Object.values(networkInterfaces()).flatMap((l) => (l ?? []).map((i) => i.address));

const escucha = (config: ConfiguracionDeSitio, ips: readonly string[]): Paso =>
  ips.includes(config.EDGE_ESCUCHA_HOST)
    ? paso(
        'escucha local',
        'OK',
        `EDGE_ESCUCHA_HOST es de este equipo (puerto ${String(config.EDGE_ESCUCHA_PUERTO)})`,
      )
    : paso(
        'escucha local',
        'FALLO',
        'EDGE_ESCUCHA_HOST no es una interfaz de este equipo: las cámaras no podrán publicar al Edge',
      );

/** `/ready` responde «¿puede la nube decidir?»; su cabecera `date`, la hora de la nube. */
const nubeYReloj = async (
  config: ConfiguracionDeSitio,
  transporte: typeof fetch,
  ahora: () => Date,
): Promise<Paso> => {
  let r: Response;
  try {
    r = await transporte(`${config.NEXT_CONTROL_API_URL}/ready`, {
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return paso(
      'nube',
      'AVISO',
      'sin enlace: el Edge decidiría en contingencia con lo que tenga en caché',
    );
  }
  if (!r.ok) {
    return paso('nube', 'AVISO', `la API responde ${String(r.status)}: no está lista para decidir`);
  }
  const fecha = Date.parse(r.headers.get('date') ?? '');
  if (Number.isNaN(fecha)) return paso('nube', 'OK', 'lista (sin hora en la respuesta)');
  const desvio = Math.round(Math.abs(ahora().getTime() - fecha) / 1000);
  return desvio > DESVIO_TOLERABLE_SEGUNDOS
    ? paso(
        'nube',
        'FALLO',
        `lista, pero el reloj del Edge se desvía ${String(desvio)} s: firmas rechazadas y vigencias mal juzgadas (DESPLIEGUE_EDGE.md §5)`,
      )
    : paso('nube', 'OK', `lista · desvío de reloj ${String(desvio)} s`);
};

const CAUSAS: Readonly<Record<string, string>> = {
  '401':
    'la API rechazó la identidad: EDGE_GATEWAY_ID desconocido o desactivado, ' +
    'EDGE_INGESTA_SECRETO no vigente (§4.1) o reloj fuera de ventana (§5)',
  '404': 'este Edge es de OTRA copropiedad: EDGE_COPROPIEDAD_ID no es la suya',
  '409': 'la API tiene una versión de reglas ANTERIOR a la de la caché: §4.4',
};

/** El paso y la versión que la nube tiene AHORA (para compararla con la caché local). */
const identidadYReglas = async (
  config: ConfiguracionDeSitio,
  transporte: typeof fetch,
): Promise<{ paso: Paso; version: number | null }> => {
  const sola = (p: Paso) => ({ paso: p, version: null });
  const cliente = new ClienteHttpDeNube({
    urlBase: config.NEXT_CONTROL_API_URL,
    secreto: config.EDGE_INGESTA_SECRETO,
    copropiedadId: config.EDGE_COPROPIEDAD_ID,
    gatewayId: config.EDGE_GATEWAY_ID,
    transporte,
  });
  try {
    const r = await cliente.descargarReglas(config.EDGE_COPROPIEDAD_ID, 0);
    if (r === null || !('autorizaciones' in r)) {
      return sola(
        paso('identidad y reglas', 'FALLO', 'la API no entregó reglas de ESTA copropiedad'),
      );
    }
    const i: InstantaneaDeReglas = r;
    if (i.hash !== undefined && i.hash !== hashDelContenido(i)) {
      return sola(
        paso('identidad y reglas', 'FALLO', 'la instantánea llegó alterada (hash distinto)'),
      );
    }
    const resumen =
      `credencial aceptada · versión ${String(i.version)} · ${String(i.autorizaciones.length)} autorizaciones · ` +
      `${String(i.vehiculos.length)} vehículos · ${String(i.plantillas?.length ?? 0)} plantillas`;
    return { paso: paso('identidad y reglas', 'OK', resumen), version: i.version };
  } catch (e) {
    const estado = /respondió (\d{3})/.exec(String(e))?.[1] ?? '';
    const causa = CAUSAS[estado];
    return sola(
      causa === undefined
        ? paso('identidad y reglas', 'AVISO', 'no se pudo preguntar a la API (sin enlace o 5xx)')
        : paso('identidad y reglas', 'FALLO', causa),
    );
  }
};

const equipo = async (
  e: EquipoDelEdge,
  peticion: typeof fetch | undefined,
  ahora: () => Date,
): Promise<Paso> => {
  const nombre = `${e.tipo} ${e.dispositivoId}`;
  const d = await diagnosticarEquipo({
    familia: FAMILIA[e.tipo],
    host: e.host,
    puerto: e.puerto,
    protocolo: e.protocolo,
    usuario: e.usuario,
    clave: e.clave,
    tiempoLimiteMs: 5_000,
    ahoraDelServidor: ahora,
    ...(peticion === undefined ? {} : { peticion }),
  });
  if (d.contacto.clase === 'sin_equipo') {
    return paso(nombre, 'FALLO', 'no hay un equipo en esa dirección (host/puerto de EDGE_EQUIPOS)');
  }
  if (d.contacto.clase === 'credencial') {
    return paso(
      nombre,
      'FALLO',
      'credencial rechazada: NO reintente a ciegas, bloquea la cuenta del equipo',
    );
  }
  // «Next Control decide, el hardware ejecuta»: una cámara que decide sola deja al Edge sin papel.
  if (d.control !== null && !d.control.admisible) {
    return paso(nombre, 'FALLO', 'la cámara decide por su cuenta: no opera en modo evento');
  }
  if (d.hora?.excesiva === true) {
    return paso(nombre, 'AVISO', `alcanzado, pero con el reloj desviado: ${d.hora.detalle}`);
  }
  return paso(nombre, 'OK', `alcanzado en ${String(d.contacto.latenciaMs ?? '?')} ms`);
};

/** La base local se LEE: si no existe, no se crea (eso lo hace el gateway al arrancar). */
const estadoLocal = (
  config: ConfiguracionDeSitio,
  ahora: () => Date,
  versionDeLaNube: number | null,
): Paso => {
  if (config.SQLITE_PATH !== ':memory:' && !existsSync(config.SQLITE_PATH)) {
    return paso(
      'base local',
      'AVISO',
      'todavía no existe: el gateway la crea al arrancar y descarga reglas',
    );
  }
  const db = abrirBase(config.SQLITE_PATH);
  try {
    const pendientes = new BandejaSqlite(db).cuantosPendientes();
    const vigente = new CacheDeReglasSqlite(db).vigente(config.EDGE_COPROPIEDAD_ID);
    if (vigente === null) {
      return paso(
        'base local',
        'AVISO',
        'sin reglas en caché: en un corte, TODO se negaría (CU-04, 3a)',
      );
    }
    // La versión sólo avanza (Q2): si la nube va por DETRÁS, el Edge rechaza todo lo que
    // le baje y se queda con reglas que la nube ya no tiene. Pasa al restaurar su base.
    if (versionDeLaNube !== null && vigente.version > versionDeLaNube) {
      const cifras = `caché v${String(vigente.version)}, nube v${String(versionDeLaNube)}`;
      return paso('base local', 'FALLO', `la caché va por delante de la nube (${cifras}): §4.4`);
    }
    const edad = Math.round((ahora().getTime() - Date.parse(vigente.generadaEn)) / 60_000);
    const resumen = `reglas v${String(vigente.version)} de hace ${String(edad)} min · ${String(pendientes)} accesos sin reconciliar`;
    return edad > config.CACHE_OBSOLETA_MINUTOS || pendientes > 0
      ? paso('base local', 'AVISO', resumen)
      : paso('base local', 'OK', resumen);
  } finally {
    db.close();
  }
};

export const diagnosticarSitio = async (
  config: ConfiguracionDeSitio,
  deps: DependenciasDelDiagnostico = {},
): Promise<Paso[]> => {
  const ahora = deps.ahora ?? (() => new Date());
  const transporte = deps.transporteDeNube ?? fetch;
  const reglas = await identidadYReglas(config, transporte);
  const pasos = [
    escucha(config, (deps.interfaces ?? ipsLocales)()),
    await nubeYReloj(config, transporte, ahora),
    reglas.paso,
  ];
  // En serie: un equipo atiende pocas sesiones a la vez y el gateway ya puede estar escuchando.
  for (const e of config.EDGE_EQUIPOS) pasos.push(await equipo(e, deps.peticionAEquipos, ahora));
  const local = await gatewayEnMarcha(config, deps.transporteLocal ?? fetch, ahora);
  pasos.push(paso('gateway en marcha', local.estado, local.detalle));
  pasos.push(estadoLocal(config, ahora, reglas.version));
  return pasos;
};

/* c8 ignore start -- la línea de órdenes se ejercita en sitio; la lógica, en las pruebas */
if (require.main === module) {
  void (async () => {
    let config: ConfiguracionDeSitio;
    try {
      config = cargarConfiguracionDeSitio();
    } catch (e) {
      process.stderr.write(`FALLO configuración\n${e instanceof Error ? e.message : String(e)}\n`);
      process.exit(2);
    }
    process.stdout.write('OK    configuración · validada con el esquema del gateway\n');
    const pasos = await diagnosticarSitio(config);
    for (const p of pasos) process.stdout.write(`${p.estado.padEnd(5)} ${p.paso} · ${p.detalle}\n`);
    process.exit(pasos.some((p) => p.estado === 'FALLO') ? 1 : 0);
  })();
}
/* c8 ignore stop */
