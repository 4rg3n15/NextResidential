/**
 * 15-Q · Q7 · ¿CADA EQUIPO CONTESTA, CON SU CREDENCIAL Y EN HORA? — el paso de
 * `pnpm sitio:edge` que habla con los equipos, con el MISMO diagnóstico de
 * `providers` que usa la consola. Salió de `diagnostico-de-sitio.ts` sin cambiar
 * una frase.
 *
 * DT-15R-09 (corrección de la 15-R) · la hora se juzga con
 * `EQUIPOS_DESVIO_DE_RELOJ_S`, el umbral con el que el Edge frena las altas con
 * vigencia, y cada petición espera `EQUIPOS_TIEMPO_LIMITE_MS`. Eran 60 s y 5 s
 * fijos: un equipo 45 s desviado salía «OK» aquí y el alta lo rechazaba.
 */
import { diagnosticarEquipo } from '@ncr/providers';
import type { FamiliaDiagnosticada } from '@ncr/providers';
import type { ConfiguracionDeAjustes } from './configuracion/esquema-de-ajustes';
import type { EquipoDelEdge } from './configuracion/esquema-de-sitio';

export interface VeredictoDeEquipo {
  readonly estado: 'OK' | 'AVISO' | 'FALLO';
  readonly detalle: string;
}

const FAMILIA: Readonly<Record<EquipoDelEdge['tipo'], FamiliaDiagnosticada>> = {
  camara_lpr: 'camara',
  terminal_facial: 'terminal',
  intercom: 'videoportero',
};

const veredicto = (estado: VeredictoDeEquipo['estado'], detalle: string): VeredictoDeEquipo => ({
  estado,
  detalle,
});

export const equipoEnSitio = async (
  e: EquipoDelEdge,
  ajustes: ConfiguracionDeAjustes,
  peticion: typeof fetch | undefined,
  ahora: () => Date,
): Promise<VeredictoDeEquipo> => {
  const d = await diagnosticarEquipo({
    familia: FAMILIA[e.tipo],
    host: e.host,
    puerto: e.puerto,
    protocolo: e.protocolo,
    usuario: e.usuario,
    clave: e.clave,
    tiempoLimiteMs: ajustes.EQUIPOS_TIEMPO_LIMITE_MS,
    desvioDeRelojMaximoS: ajustes.EQUIPOS_DESVIO_DE_RELOJ_S,
    ahoraDelServidor: ahora,
    ...(peticion === undefined ? {} : { peticion }),
  });
  if (d.contacto.clase === 'sin_equipo') {
    return veredicto('FALLO', 'no hay un equipo en esa dirección (host/puerto de EDGE_EQUIPOS)');
  }
  if (d.contacto.clase === 'credencial') {
    return veredicto(
      'FALLO',
      'credencial rechazada: NO reintente a ciegas, bloquea la cuenta del equipo',
    );
  }
  // «Next Control decide, el hardware ejecuta»: una cámara que decide sola deja al Edge sin papel.
  if (d.control !== null && !d.control.admisible) {
    return veredicto('FALLO', 'la cámara decide por su cuenta: no opera en modo evento');
  }
  if (d.hora?.excesiva === true) {
    return veredicto('AVISO', `alcanzado, pero con el reloj desviado: ${d.hora.detalle}`);
  }
  return veredicto('OK', `alcanzado en ${String(d.contacto.latenciaMs ?? '?')} ms`);
};
