/**
 * Raíz de composición del Edge Gateway. Aquí, y solo aquí, se construye todo.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ES EL ÚNICO FICHERO CON TEMPORIZADORES Y CON UN SERVIDOR
 *
 * Todo lo demás son funciones y clases que reciben lo que necesitan. Esa
 * disciplina es lo que permite que las pruebas de la DoD —30 minutos sin WAN,
 * 24 horas de autonomía— corran en milisegundos: el tiempo entra por parámetro.
 * Si un `setInterval` viviera dentro del `Gateway`, esas pruebas durarían media
 * hora y un día, y nadie las ejecutaría.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ HACE AL ARRANCAR, EN ESTE ORDEN
 *
 * 1. Carga y VALIDA la configuración. Si falta algo, no arranca (§2.7.1).
 * 2. Abre SQLite y aplica el esquema. La bandeja de un corte anterior sigue ahí.
 * 3. Levanta el receptor de hechos del hardware.
 * 4. Arranca el tic: sonda del enlace y, si hay, reconciliación.
 *
 * El paso 2 antes del 3 no es casual: aceptar un hecho sin bandeja donde
 * encolarlo sería perder un acceso, y RN-02 no lo admite.
 */
import { createServer } from 'node:http';
import { cargarConfiguracion } from './configuracion/esquema';
import { abrirBase } from './infraestructura/sqlite/esquema';
import { BandejaSqlite } from './infraestructura/sqlite/bandeja-sqlite';
import { CacheDeReglasSqlite } from './infraestructura/sqlite/cache-de-reglas';
import { ClienteHttpDeNube, SondaHttp } from './infraestructura/api/cliente-de-nube';
import { DecidirLocalmente } from './aplicacion/decidir-localmente';
import { Reconciliacion } from './aplicacion/reconciliacion';
import { Gateway } from './aplicacion/gateway';
import type { HechoLocal } from './aplicacion/instantanea-de-reglas';

const registrar = (nivel: 'info' | 'aviso' | 'error', mensaje: string, contexto?: unknown): void => {
  // Registro estructurado, como en la API. Nunca se registra el secreto ni el
  // cuerpo de un evento: el primero es una credencial y el segundo lleva placas
  // y personas, que son datos personales (Ley 1581).
  process.stdout.write(
    `${JSON.stringify({ nivel, mensaje, momento: new Date().toISOString(), contexto })}\n`,
  );
};

const arrancar = (): void => {
  const config = cargarConfiguracion();

  const db = abrirBase(config.SQLITE_PATH);
  const bandeja = new BandejaSqlite(db);
  const cache = new CacheDeReglasSqlite(db);

  const nube = new ClienteHttpDeNube({
    urlBase: config.NEXT_CONTROL_API_URL,
    secreto: config.EDGE_INGESTA_SECRETO,
    copropiedadId: config.EDGE_COPROPIEDAD_ID,
  });

  const gateway = new Gateway(
    new DecidirLocalmente(cache, {
      copropiedadId: config.EDGE_COPROPIEDAD_ID,
      contingencia: config.CONTINGENCIA_SIN_REGLA,
      cacheObsoletaMinutos: config.CACHE_OBSOLETA_MINUTOS,
    }),
    bandeja,
    new SondaHttp(config.NEXT_CONTROL_API_URL),
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

  const servidor = createServer((peticion, respuesta) => {
    if (peticion.method !== 'POST' || peticion.url !== '/hechos') {
      respuesta.writeHead(404).end();
      return;
    }
    let crudo = '';
    // Tope de tamaño: un cuerpo sin límite es una forma de tumbar el gateway
    // desde la red local (§2.7.8).
    peticion.on('data', (trozo: Buffer) => {
      crudo += trozo.toString('utf8');
      if (crudo.length > 64 * 1024) {
        respuesta.writeHead(413).end();
        peticion.destroy();
      }
    });
    peticion.on('end', () => {
      try {
        const cuerpo = JSON.parse(crudo) as Omit<HechoLocal, 'ocurridoEn'> & {
          ocurridoEn?: string;
        };
        const hecho: HechoLocal = {
          ...cuerpo,
          ocurridoEn: cuerpo.ocurridoEn === undefined ? new Date() : new Date(cuerpo.ocurridoEn),
        };
        const decision = gateway.alRecibirHecho(hecho);
        respuesta
          .writeHead(200, { 'content-type': 'application/json' })
          .end(
            JSON.stringify({
              permitido: decision.resultado.permitido,
              motivo: decision.resultado.permitido ? null : decision.resultado.motivo,
              versionDeReglas: decision.resultado.versionDeReglas.numero,
              porContingencia: decision.porContingencia,
              requiereEscalamiento: decision.requiereEscalamiento,
            }),
          );
      } catch (e) {
        // Denegar ante un cuerpo ilegible, no abrir. §2.1.4.
        registrar('error', 'hecho ilegible', { detalle: String(e) });
        respuesta.writeHead(400).end();
      }
    });
  });
  servidor.listen(8080, () => registrar('info', 'edge escuchando hechos', { puerto: 8080 }));

  const tic = async (): Promise<void> => {
    try {
      const r = await gateway.tic(new Date());
      if (r.conmuto) registrar('aviso', 'el enlace cambió de modo', { modo: r.modo });
      if (r.reconciliacion !== null && r.reconciliacion.enviados > 0) {
        registrar('info', 'bandeja reconciliada', r.reconciliacion);
      }
    } catch (e) {
      // Un tic que lanza no puede detener los siguientes: el gateway tiene que
      // seguir abriendo puertas aunque la nube esté rota.
      registrar('error', 'fallo en el tic', { detalle: String(e) });
    }
  };
  setInterval(() => void tic(), config.SONDA_WAN_SEGUNDOS * 1000).unref();
  void tic();
};

/* c8 ignore start -- la raíz de composición se ejercita desplegando, no en pruebas */
if (require.main === module) {
  try {
    arrancar();
  } catch (e) {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
  }
}
/* c8 ignore stop */

export { arrancar };
