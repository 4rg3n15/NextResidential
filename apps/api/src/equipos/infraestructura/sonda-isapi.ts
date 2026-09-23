import {
  ClienteDeEquipo,
  EquipoInalcanzable,
  interpretarError,
  juzgarModo,
  leerCtrlMod,
  rutaPara,
} from '@ncr/providers';
import type { DatosDeSondeo, ResultadoDeSondeo, SondaDeEquipo } from '../aplicacion/puertos';

/**
 * «Probar conexión», de verdad y **desde el servidor**.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * POR QUÉ AQUÍ Y NO EN EL NAVEGADOR (A.5)
 *
 * El que tiene que alcanzar el equipo es el SERVIDOR de Next Control, no el
 * navegador de quien rellena el formulario. Si la prueba se hiciera desde el
 * navegador, diría que sí en el portátil del administrador —que está en la red
 * del conjunto— y el sistema seguiría sin poder hablar con la cámara. Un «✓
 * conectado» que miente es peor que no tener el botón.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * NI UNA RUTA ESCRITA AQUÍ
 *
 * Las rutas salen del catálogo de `@ncr/providers`, con su procedencia. Es la
 * regla del proyecto (KPI-11) y además es lo que hace que esta sonda no tenga
 * que enterarse el día que una ruta cambie de sitio.
 */

const modeloYFirmware = (cuerpo: string): { modelo: string | null; firmware: string | null } => ({
  modelo: /<model>\s*([^<]+)\s*<\/model>/i.exec(cuerpo)?.[1]?.trim() ?? null,
  firmware: /<firmwareVersion>\s*([^<]+)\s*<\/firmwareVersion>/i.exec(cuerpo)?.[1]?.trim() ?? null,
});

/**
 * El aviso de la credencial rechazada es literal y se repite en la pantalla: el
 * modo de fallo real no es teclear mal la clave una vez, es **volver a
 * intentarlo cinco veces** y dejar la cuenta de servicio bloqueada en el equipo.
 */
export const AVISO_DE_CREDENCIAL =
  'El equipo rechazó el usuario o la clave. NO vuelva a intentarlo a ciegas: ' +
  'estos aparatos bloquean la cuenta tras unos pocos intentos fallidos. ' +
  'Confirme la credencial en el equipo antes de reintentar.';

export class SondaIsapi implements SondaDeEquipo {
  constructor(private readonly peticion?: typeof fetch) {}

  async probar(datos: DatosDeSondeo): Promise<ResultadoDeSondeo> {
    const cliente = new ClienteDeEquipo({
      host: datos.host,
      puerto: datos.puerto,
      protocolo: datos.protocolo,
      usuario: datos.usuario,
      clave: datos.secreto,
      ...(this.peticion === undefined ? {} : { peticion: this.peticion }),
    });

    const identidad = rutaPara('leer la identidad del equipo (modelo, firmware, serie)', 'comun');
    let respuesta;
    try {
      respuesta = await cliente.pedir(identidad.metodo, identidad.ruta);
    } catch (error) {
      // Host y puerto SÍ se nombran: es lo que hay que revisar. El secreto no
      // aparece por ninguna parte, tampoco en el texto del error.
      const detalle =
        error instanceof EquipoInalcanzable
          ? `No hay respuesta de ${datos.host}:${String(datos.puerto)} por ${datos.protocolo.toUpperCase()}. ${error.detalle}`
          : `No hay respuesta de ${datos.host}:${String(datos.puerto)}`;
      return {
        clase: 'inalcanzable',
        detalle,
        modelo: null,
        firmware: null,
        latenciaMs: null,
        verificado: false,
      };
    }

    if (respuesta.estado === 401 || respuesta.estado === 403) {
      return {
        clase: 'credencial',
        detalle: AVISO_DE_CREDENCIAL,
        modelo: null,
        firmware: null,
        latenciaMs: respuesta.latenciaMs,
        verificado: false,
      };
    }

    if (!respuesta.ok) {
      const error = interpretarError(respuesta.cuerpo);
      const esCredencial = error.reaccion === 'credencial_rechazada';
      return {
        clase: esCredencial ? 'credencial' : 'inalcanzable',
        detalle: esCredencial
          ? AVISO_DE_CREDENCIAL
          : `El equipo respondió con un error: ${error.detalle}`,
        modelo: null,
        firmware: null,
        latenciaMs: respuesta.latenciaMs,
        verificado: false,
      };
    }

    const { modelo, firmware } = modeloYFirmware(respuesta.cuerpo);

    /**
     * C.1 llevado al alta: una cámara LPR que decide por su cuenta no se da por
     * buena aunque conteste y autentique. «Next Control decide, el hardware
     * ejecuta» no es una frase del README: es esta comprobación.
     */
    if (datos.tipo === 'camara_lpr') {
      const modo = rutaPara('leer quién controla la barrera: la cámara o la plataforma', 'camara');
      try {
        const r = await cliente.pedir(modo.metodo, modo.ruta);
        const veredicto = r.ok ? juzgarModo(leerCtrlMod(r.cuerpo)) : juzgarModo(null);
        if (!veredicto.admisible) {
          return {
            clase: 'decide_solo',
            detalle: veredicto.detalle,
            modelo,
            firmware,
            latenciaMs: respuesta.latenciaMs,
            verificado: false,
          };
        }
      } catch {
        // Si la identidad respondió y esta ruta no, el equipo está ahí pero no
        // se pudo confirmar quién manda. No se da por bueno.
        return {
          clase: 'decide_solo',
          detalle:
            'El equipo responde, pero no se pudo leer quién controla la barrera. ' +
            'Hasta confirmarlo, queda NO VERIFICADO.',
          modelo,
          firmware,
          latenciaMs: respuesta.latenciaMs,
          verificado: false,
        };
      }
    }

    return {
      clase: 'alcanzado',
      detalle:
        modelo === null
          ? 'El equipo responde y acepta la credencial'
          : `El equipo responde y acepta la credencial: ${modelo}`,
      modelo,
      firmware,
      latenciaMs: respuesta.latenciaMs,
      verificado: true,
    };
  }
}
