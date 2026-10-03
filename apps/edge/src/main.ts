/**
 * El Edge Gateway en marcha. Aquí, y solo aquí, hay temporizadores y un servidor.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ HACE AL ARRANCAR, EN ESTE ORDEN (15-Q; 15-Q2, ADR-035)
 *
 * 1. Carga y VALIDA la configuración (ETAPA 12, sitio y puente): si falta algo, no arranca.
 * 2. Compone todo (`composicion-puente.ts`): SQLite, la nube, los equipos, la
 *    contingencia y, con `EDGE_TUNEL=activo`, el túnel saliente hacia la API.
 * 3. Escucha en UNA interfaz (`EDGE_ESCUCHA_HOST`): cámaras y entradas firmadas.
 * 4. Abre las escuchas de la terminal y el videoportero, y las rearma.
 * 5. Arranca el tic: sonda del enlace, reconciliación y descarga de reglas.
 *
 * Todo lo demás son funciones y clases que reciben el tiempo por parámetro: es
 * lo que permite que la DoD —30 min sin WAN, 24 h de autonomía— corra en
 * milisegundos (`apps/api/test/edge-en-sitio-pg.e2e.test.ts`).
 */
import { createServer } from 'node:http';
import { cargarConfiguracionDelPuente } from './configuracion/esquema-del-puente';
import { componerPuente } from './composicion-puente';
import type { Registrar } from './composicion';

const registrar: Registrar = (nivel, mensaje, contexto) => {
  // Registro estructurado, como en la API. Nunca el secreto ni el cuerpo de un
  // evento: el primero es una credencial y el segundo lleva placas y personas.
  process.stdout.write(
    `${JSON.stringify({ nivel, mensaje, momento: new Date().toISOString(), contexto })}\n`,
  );
};

const arrancar = (): void => {
  const config = cargarConfiguracionDelPuente();
  const { edge, tunel } = componerPuente(config, { registrar });
  tunel?.iniciar();

  createServer((req, res) => void edge.manejador(req, res)).listen(
    config.EDGE_ESCUCHA_PUERTO,
    config.EDGE_ESCUCHA_HOST,
    () =>
      registrar('info', 'edge escuchando en la red del conjunto', {
        puerto: config.EDGE_ESCUCHA_PUERTO,
        equipos: config.EDGE_EQUIPOS.length,
      }),
  );

  const rearmar = (): void =>
    void edge.rearmarEscuchas().then((activas) => {
      registrar('info', 'escuchas de equipos', { activas });
    });
  setInterval(rearmar, config.ESCUCHAS_REARME_SEGUNDOS * 1000).unref();
  rearmar();

  const tic = async (): Promise<void> => {
    try {
      const r = await edge.contingencia.tic(new Date());
      if (r.conmuto) registrar('aviso', 'el enlace cambió de modo', { modo: r.modo });
      if (r.reconciliacion !== null && r.reconciliacion.enviados > 0) {
        registrar('info', 'bandeja reconciliada', r.reconciliacion);
      }
      if (r.descarga !== null && r.descarga.estado !== 'vigente') {
        registrar(r.descarga.estado === 'nueva' ? 'info' : 'aviso', 'reglas', r.descarga);
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
