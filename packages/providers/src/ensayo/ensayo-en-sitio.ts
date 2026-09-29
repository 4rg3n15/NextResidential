import { diagnosticarEquipo } from '../diagnostico/diagnostico-de-equipo';
import { fichaDe } from '../diagnostico/ficha';
import { ClienteDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { soporta } from '../nucleo/capacidades';
import { juzgarPersonasYRostros } from './capacidades-de-personas';
import { pasoDeApertura, pasoDeRostro } from './pasos-de-accion';
import { pasoDeAudio } from './paso-de-audio';
import { pasoDeEventos } from './paso-de-eventos';
import { pasoDeVerificacion } from './paso-de-verificacion';
import { pasoDeConexion, pasoDeConfiguracion, pasoDeHora, pasoDeVideo } from './pasos-de-lectura';
import { pasoDeVideoWebrtc } from './paso-de-video-webrtc';
import { PASOS_DEL_ENSAYO, resultado } from './tipos';
import type { FamiliaDeEnsayo, OpcionesDeEnsayo, ResultadoDePaso } from './tipos';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 (ETAPA 15-L) · `pnpm sitio:ensayo`, EQUIPO POR EQUIPO
 *
 * Los nueve pasos, en orden, con un diagnóstico único al principio (el mismo de
 * «Probar conexión»). Si el paso 1 falla, NO se sigue: con la credencial
 * rechazada, cada petición más es un intento fallido que acerca el bloqueo de
 * la IP del Mac, y sin conexión los demás pasos sólo repetirían la causa.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export interface InformeDeEnsayo {
  readonly familia: FamiliaDeEnsayo;
  /** C6 (15-M) · el nombre de la ficha, si el equipo viene del registro. */
  readonly nombre?: string;
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly pasos: readonly ResultadoDePaso[];
}

const leerDocumento = async (
  o: OpcionesDeEnsayo,
  proposito: string,
  familia: 'comun' | 'terminal',
): Promise<string | null> => {
  const ruta = rutaPara(proposito, familia);
  try {
    const r = await new ClienteDeEquipo(o.equipo).pedir(ruta.metodo, ruta.ruta, ruta.cuerpo);
    return r.ok && !/notSupport|invalidOperation/i.test(r.cuerpo) ? r.cuerpo : null;
  } catch {
    return null;
  }
};

export const ensayarEquipo = async (
  o: OpcionesDeEnsayo,
  esperar?: (ms: number) => Promise<void>,
): Promise<InformeDeEnsayo> => {
  const { equipo } = o;
  const d = await diagnosticarEquipo({
    ...equipo,
    familia: equipo.familia,
    canal: equipo.puerta,
    ahoraDelServidor: o.ahora,
    video: { puerto: equipo.puertoRtsp, canal: equipo.canalDeVideo },
  });
  const informe = (pasos: readonly ResultadoDePaso[]): InformeDeEnsayo => ({
    familia: equipo.familia,
    ...(equipo.nombre === undefined ? {} : { nombre: equipo.nombre }),
    modelo: d.modelo,
    firmware: d.firmware,
    pasos,
  });

  const conexion = pasoDeConexion(d, equipo.familia);
  if (conexion.estado !== 'ok') {
    return informe([
      conexion,
      ...PASOS_DEL_ENSAYO.slice(1).map(({ paso }) =>
        resultado(paso, 'omitido', 'Sin conexión con el equipo no se sigue', 'Corrija el paso 1'),
      ),
    ]);
  }

  const pasos: ResultadoDePaso[] = [conexion];
  pasos.push(
    pasoDeHora(d, await leerDocumento(o, 'leer la hora del equipo', 'comun'), o.zona, o.ahora()),
  );

  const c = d.capacidadesDelEquipo;
  const conRostros =
    equipo.familia === 'terminal' ||
    (equipo.familia === 'videoportero' && c !== null && soporta(c, 'bibliotecaDeRostros'));
  const extras = conRostros
    ? juzgarPersonasYRostros(
        await leerDocumento(o, 'leer qué admite la biblioteca de rostros', 'terminal'),
        await leerDocumento(o, 'leer qué admite la gestión de personas', 'terminal'),
        o.limitesDeFoto,
      )
    : { fallos: [], notas: [] };
  pasos.push(pasoDeConfiguracion(fichaDe(d), extras));
  pasos.push(await pasoDeEventos(o));
  pasos.push(await pasoDeApertura(o));
  pasos.push(await pasoDeRostro(o, c, esperar));
  // E2/C1 (15-M) · la sonda RTSP y, con GO2RTC_URL, la negociación WebRTC real.
  pasos.push(await pasoDeVideoWebrtc(o, pasoDeVideo(d, equipo.familia)));
  pasos.push(await pasoDeAudio(o, c, esperar));
  pasos.push(await pasoDeVerificacion(o, c));
  return informe(pasos);
};
