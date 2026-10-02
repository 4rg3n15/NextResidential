import type { Bitacora } from '@ncr/domain-core';
import { diagnosticarEquipo, fichaDe } from '@ncr/providers';
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
 * ESTA CLASE YA NO SABE NADA DEL PROTOCOLO · 15-C
 *
 * Hasta la 15-B pedía tres rutas del catálogo, interpretaba el modo de control
 * y leía el modelo con una expresión regular sobre el XML. Nada de eso era del
 * fabricante por nombre —KPI-11 pasaba— pero sí por **tipo**: importaba el
 * cliente, el catálogo y el juez del modo de control.
 *
 * Ahora llama a **una** función del paquete de proveedores y traduce su
 * veredicto a los cuatro desenlaces de la consola. La frontera es real: si
 * mañana el diagnóstico pide diez consultas más, este fichero no cambia.
 */

/**
 * El aviso de la credencial rechazada es literal y se repite en la pantalla: el
 * modo de fallo real no es teclear mal la clave una vez, es **volver a
 * intentarlo cinco veces** y dejar la cuenta de servicio bloqueada en el equipo.
 */
/** De tipo de equipo a familia de rutas. Por CAPACIDADES después; esto sólo elige qué preguntar. */
const familiaDe = (tipo: DatosDeSondeo['tipo']): 'camara' | 'terminal' | 'videoportero' =>
  tipo === 'terminal_facial' ? 'terminal' : tipo === 'intercom' ? 'videoportero' : 'camara';

/**
 * §7.1 · la dirección del equipo NO forma parte del contrato público. En el
 * detalle de «inalcanzable» se nombra ELIDIDA —lo justo para reconocerla—: quien
 * la tecleó hace un momento la reconoce, y quien lee la ficha de un equipo en
 * servicio no se la lleva.
 */
export const elidir = (texto: string): string =>
  texto.length <= 4 ? '****' : `${texto.slice(0, 2)}…${texto.slice(-2)}`;

export const AVISO_DE_CREDENCIAL =
  'El equipo rechazó el usuario o la clave. NO vuelva a intentarlo a ciegas: ' +
  'estos aparatos bloquean la cuenta tras unos pocos intentos fallidos. ' +
  'Confirme la credencial en el equipo antes de reintentar.';

/** Los tipos que entregan video por RTSP. */
const CON_VIDEO: ReadonlySet<DatosDeSondeo['tipo']> = new Set([
  'camara_lpr',
  'terminal_facial',
  'intercom',
]);

export class SondaPorProveedor implements SondaDeEquipo {
  constructor(
    private readonly peticion?: typeof fetch,
    /** H-SITIO-05 · qué ruta de capacidad se consultó y qué respondió. */
    private readonly traza?: Bitacora,
    /**
     * D2 · C3 (15-L) · con el puerto RTSP (del `.env`), la sonda le pregunta
     * al equipo qué video entrega en el canal de su ficha. Sin él, no.
     */
    private readonly puertoRtsp?: number,
    /** R2 (15-N) · `EQUIPOS_DESVIO_DE_RELOJ_S`: la ficha juzga el reloj con el umbral de las altas. */
    private readonly desvioDeRelojMaximoS?: number,
    /** 15-Q2 · C2 · con puente, el mismo diagnóstico corre en el Edge (`por-el-edge.ts`). */
    private readonly diagnosticar: typeof diagnosticarEquipo = diagnosticarEquipo,
  ) {}

  async probar(datos: DatosDeSondeo): Promise<ResultadoDeSondeo> {
    /**
     * O4 · el diagnóstico es POLIMÓRFICO: se le dice la familia real y él
     * decide qué preguntar. Una terminal ya no recibe la ficha de una cámara
     * con cinco «no comprobado» que no le aplican, sino la suya: si espera el
     * veredicto, si su biblioteca cabe, si abre desde aquí.
     */
    const diagnostico = await this.diagnosticar({
      host: datos.host,
      puerto: datos.puerto,
      protocolo: datos.protocolo,
      usuario: datos.usuario,
      clave: datos.secreto,
      familia: familiaDe(datos.tipo),
      // E1-e (15-M) · la dispara una PERSONA: se presenta la clave una vez más aunque
      // el equipo la rechazara hace un rato. El sondeo periódico respeta la marca.
      olvidarRechazo: true,
      ...(this.desvioDeRelojMaximoS === undefined
        ? {}
        : { desvioDeRelojMaximoS: this.desvioDeRelojMaximoS }),
      ...(this.peticion === undefined ? {} : { peticion: this.peticion }),
      ...(this.traza === undefined ? {} : { traza: this.traza }),
      ...(datos.canalBarrera === undefined || datos.canalBarrera === null
        ? {}
        : { canal: datos.canalBarrera }),
      ...(this.puertoRtsp === undefined || !CON_VIDEO.has(datos.tipo)
        ? {}
        : // V2 (15-N) · sin canal en la ficha, el diagnóstico elige uno DECLARADO.
          { video: { puerto: this.puertoRtsp, canal: datos.canalDeVideo ?? null } }),
    });

    const ficha = fichaDe(diagnostico);
    /**
     * O2 · las CAPACIDADES viajan con el veredicto para que el alta las
     * persista; O4 las trae el propio diagnóstico, en la misma ronda de
     * consultas. Sólo cuando el equipo contestó: unas capacidades
     * «descubiertas» de un aparato que no se alcanzó serían una mentira.
     */
    const capacidades =
      diagnostico.contacto.clase === 'alcanzado' ? diagnostico.capacidadesDelEquipo : null;
    /**
     * V2 (15-N) · el canal propuesto entre los declarados viaja para guardarse.
     * 15-P (0.5) · el 101 por omisión, sólo si el equipo lo describió: un
     * canal que el equipo niega no se escribe en la ficha.
     */
    const v = diagnostico.video;
    const propuesto =
      v?.origenDelCanal === 'propuesto' ||
      (v?.origenDelCanal === 'por_omision' && v.clase === 'respondio')
        ? v.canal
        : undefined;
    const base = {
      modelo: diagnostico.modelo,
      firmware: diagnostico.firmware,
      latenciaMs: diagnostico.contacto.latenciaMs,
      ficha,
      ...(capacidades === null ? {} : { capacidades }),
      ...(propuesto === undefined ? {} : { canalDeVideo: propuesto }),
    };

    /**
     * ═══════════════════════════════════════════════════════════════════════
     * «NO CONTESTA» Y «CREDENCIAL MALA» YA NO SE CONFUNDEN
     *
     * La primera consulta del diagnóstico **no presenta credenciales**, así que
     * distingue «no hay ningún equipo en esa dirección» de «hay uno y rechaza
     * la clave». Antes las dos caían en `inalcanzable`, y la diferencia es
     * cara: una manda a revisar el cable y la VLAN, la otra el usuario de
     * servicio — y reintentar la segunda **bloquea la cuenta del equipo**.
     */
    if (diagnostico.contacto.clase === 'sin_equipo') {
      return {
        ...base,
        clase: 'inalcanzable',
        // Host y puerto SÍ se nombran: es lo que hay que revisar. El secreto no
        // aparece por ninguna parte, tampoco en el texto del error.
        detalle: `${diagnostico.contacto.detalle.replaceAll(datos.host, elidir(datos.host))} (${elidir(datos.host)}:${String(datos.puerto)} por ${datos.protocolo.toUpperCase()})`,
        verificado: false,
      };
    }

    if (diagnostico.contacto.clase === 'credencial') {
      return { ...base, clase: 'credencial', detalle: AVISO_DE_CREDENCIAL, verificado: false };
    }

    /**
     * C.1 llevado al alta, y ahora por las TRES vías: modo de control,
     * políticas internas del equipo y disparadores vinculados. Una cámara que
     * abre por su cuenta no se da por buena aunque conteste y autentique.
     * «Next Control decide, el hardware ejecuta» no es una frase del README:
     * es esta comprobación.
     */
    const bloqueos = ficha.hallazgos.filter((h) => h.estado === 'bloqueo');
    if (datos.tipo === 'camara_lpr' && bloqueos.length > 0) {
      return {
        ...base,
        clase: 'decide_solo',
        detalle: bloqueos.map((b) => `${b.campo}: ${b.detalle}`).join(' · '),
        verificado: false,
      };
    }
    /**
     * O4 · la terminal, al nivel de la cámara: si no espera el veredicto de la
     * plataforma decide sola, y eso no se da por bueno… salvo que la consola
     * lo haya DECLARADO a sabiendas («decide el equipo»). Entonces no es un
     * hallazgo oculto sino una decisión registrada, y el equipo queda
     * verificado con el aviso a la vista.
     */
    const decideSola = bloqueos.find((b) => /quién decide/.test(b.campo));
    if (
      datos.tipo === 'terminal_facial' &&
      decideSola !== undefined &&
      datos.modoDeTerminal !== 'decide_el_equipo'
    ) {
      return {
        ...base,
        clase: 'decide_solo',
        detalle: `${decideSola.campo}: ${decideSola.detalle}`,
        verificado: false,
      };
    }

    const avisos = ficha.hallazgos.filter((h) => h.estado === 'aviso');
    // Un bloqueo que no es «decide sola» —una puerta que no abre desde aquí,
    // una biblioteca inexistente— se CUENTA en el detalle: el equipo contesta y
    // autentica, pero la ficha dice que hay algo que impide operar.
    return {
      ...base,
      clase: 'alcanzado',
      detalle:
        (diagnostico.modelo === null
          ? 'El equipo responde y acepta la credencial'
          : `El equipo responde y acepta la credencial: ${diagnostico.modelo}`) +
        (bloqueos.length === 0 ? '' : `. ${String(bloqueos.length)} bloqueo(s) en la ficha`) +
        (avisos.length === 0 ? '' : `. ${String(avisos.length)} aviso(s) de configuración`),
      verificado: true,
    };
  }
}
