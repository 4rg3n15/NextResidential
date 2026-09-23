import { ClienteDeEquipo, EquipoInalcanzable } from '../equipo/cliente';
import type { OpcionesDeEquipo } from '../equipo/cliente';
import { rutaPara } from '../equipo/catalogo-de-rutas';
import { interpretarError } from '../equipo/errores-del-fabricante';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `ctrlMod` · LA COMPROBACIÓN QUE DECIDE QUIÉN MANDA
 *
 * El principio rector del producto cabe en una frase —«Next Control decide, el
 * hardware ejecuta»— y hasta hoy **no había una sola línea de código que lo
 * comprobara**. Estaba escrito en el README, en la auditoría documental, en
 * tres ADR y en la guía de puesta en marcha; y el equipo podía estar abriendo
 * por su cuenta sin que nada se pusiera rojo.
 *
 * | Valor | Quién abre al reconocer una placa | ¿Admisible? |
 * | ----- | --------------------------------- | ----------- |
 * | `0`   | La CÁMARA, por su lista interna   | **No**      |
 * | `1`   | La PLATAFORMA                     | **Sí**      |
 * | `2`   | Ambas                             | **No**      |
 *
 * `2` **no es un término medio**: la cámara sigue abriendo por su cuenta cuando
 * reconoce una placa de su lista, y además nosotros podemos abrir. El motor de
 * reglas queda decorativo exactamente igual que con `0`.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * SE COMPRUEBA AL ARRANCAR, Y EL SISTEMA SE NIEGA A OPERAR
 *
 * No es una advertencia en un informe que alguien leerá. Con `0` o `2`, cada
 * evento que llegue de ese equipo es sospechoso —pudo abrirlo él— y cada
 * decisión que tomemos es una segunda opinión sobre algo ya hecho. Un sistema
 * que sigue operando así **miente sobre su propia trazabilidad**, que es el
 * único activo que esta plataforma vende.
 *
 * Lo que NO se hace: corregirlo por nuestra cuenta. Cambiar el modo de control
 * de un equipo de acceso desde un arranque automático es exactamente la clase
 * de acción que nadie ve venir. Se dice qué pasa, qué valor tiene y cuál
 * debería tener, y lo cambia una persona.
 */

export type ModoDeControl = 'camara' | 'plataforma' | 'ambos';

export const MODO_EXIGIDO: ModoDeControl = 'plataforma';

const POR_VALOR: Readonly<Record<string, ModoDeControl>> = {
  '0': 'camara',
  '1': 'plataforma',
  '2': 'ambos',
};

export interface VeredictoDeModo {
  readonly admisible: boolean;
  readonly modo: ModoDeControl | null;
  /** El valor crudo, para poder buscarlo en la guía si no lo conocemos. */
  readonly valorLeido: string | null;
  readonly detalle: string;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * [CORREGIR · 15-C] LAS DOS GRAFÍAS, Y POR QUÉ HAY DOS
 *
 * Este lector buscaba **sólo** `<ctrlMod>`. El esquema XML del capítulo de
 * referencia de la guía declara `<ctrlMode>`, **con «e»**:
 *
 *   <EntranceParamList version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
 *     <EntranceParam>
 *       <laneNum>1</laneNum>
 *       <bEnable>true</bEnable>
 *       <ctrlMode>1</ctrlMode>
 *
 * La expresión anterior no casaba nunca contra un equipo real, así que devolvía
 * `null`, y `juzgarModo(null)` rechaza el equipo por «no declaró quién controla
 * la barrera». **Falla cerrado, que es lo correcto**, y el efecto era el peor
 * posible de un fallo correcto: una cámara BIEN configurada se rechazaba, y el
 * mensaje mandaba a revisar justo lo que estaba bien.
 *
 * Se aceptan las dos porque el propio documento usa las dos: el capítulo de
 * control de barrera de entrada y salida la nombra `ctrlMod` en la ruta JSON, y
 * el esquema XML la declara `ctrlMode`. Queda registrado como contradicción
 * C-16 en `docs/auditoria/contradicciones-y-supuestos.md`. **Al ESCRIBIR se usa
 * la del esquema**, que es la que el equipo valida.
 */
export const leerCtrlMod = (cuerpo: string): string | null => {
  const enXml = /<ctrlMode?>\s*(-?\d+)\s*<\/ctrlMode?>/i.exec(cuerpo)?.[1];
  if (enXml !== undefined) return enXml;
  const enJson = /"ctrlMode?"\s*:\s*"?(-?\d+)"?/i.exec(cuerpo)?.[1];
  return enJson ?? null;
};

/** La grafía con la que se ESCRIBE: la del esquema XML. */
export const ETIQUETA_DE_MODO = 'ctrlMode';

export const juzgarModo = (valorLeido: string | null): VeredictoDeModo => {
  if (valorLeido === null) {
    return {
      admisible: false,
      modo: null,
      valorLeido: null,
      // No saberlo NO es «probablemente está bien». Es no saberlo, y la
      // dirección segura es la misma que en todo lo demás de este proyecto.
      detalle:
        'El equipo no declaró quién controla la barrera. Sin esa respuesta no se puede ' +
        'afirmar que la plataforma decide, y el sistema no opera sobre una suposición',
    };
  }
  const modo = POR_VALOR[valorLeido] ?? null;
  if (modo === 'plataforma') {
    return {
      admisible: true,
      modo,
      valorLeido,
      detalle: 'La plataforma controla la barrera: el equipo reporta y nosotros decidimos',
    };
  }
  return {
    admisible: false,
    modo,
    valorLeido,
    detalle:
      modo === null
        ? `El equipo declaró un modo de control que no está documentado (${valorLeido})`
        : modo === 'camara'
          ? 'EL EQUIPO ABRE POR SU CUENTA con su lista interna de placas. El motor de ' +
            'reglas quedaría decorativo y el histórico incompleto'
          : 'El equipo abre por su cuenta ADEMÁS de admitir nuestras órdenes. No es un ' +
            'término medio: sigue decidiendo él, y lo que registremos será una segunda ' +
            'opinión sobre algo ya hecho',
  };
};

/**
 * El sistema se niega a operar contra un equipo que decide por su cuenta.
 *
 * Lleva el veredicto porque quien lo recibe tiene que poder decir en pantalla
 * **qué hay que cambiar**, no sólo que algo va mal.
 */
export class EquipoDecidePorSuCuenta extends Error {
  /**
   * `motivos` lleva TODOS los bloqueos del veredicto completo, no sólo el del
   * modo de control. Desde la 15-C hay tres vías por las que un equipo puede
   * abrir por su cuenta, y decir sólo la primera manda a corregir un campo que
   * a veces ya está bien.
   */
  constructor(
    readonly veredicto: VeredictoDeModo,
    readonly motivos: readonly string[] = [],
  ) {
    super(
      `El equipo no opera bajo control de la plataforma: ${veredicto.detalle}. ` +
        (motivos.length > 0 ? `Además: ${motivos.join(' · ')}. ` : '') +
        'Cámbielo en la configuración del aparato antes de integrarlo (guía §8.2)',
    );
    this.name = 'EquipoDecidePorSuCuenta';
  }
}

export interface OpcionesDeComprobacion extends OpcionesDeEquipo {
  /**
   * Qué hacer si el equipo **no contesta**. Por omisión se trata como no
   * admisible, igual que todo lo demás aquí: un equipo apagado no demuestra
   * nada. Se relaja para el alta desde la consola, donde guardar un equipo
   * apagado es legítimo y queda marcado NO VERIFICADO.
   */
  readonly inalcanzableEsAdmisible?: boolean;
}

/**
 * Pregunta al equipo quién manda. **No cambia nada del aparato.**
 *
 * Devuelve el veredicto en vez de lanzar: quien lo llama decide si eso impide
 * arrancar —el proveedor— o sólo marca el equipo como no verificado —el alta
 * desde la consola—. Dos políticas sobre el mismo hecho, y el hecho se mide una
 * sola vez.
 */
export const comprobarModoDeControl = async (
  opciones: OpcionesDeComprobacion,
): Promise<VeredictoDeModo> => {
  const cliente = new ClienteDeEquipo(opciones);
  const ruta = rutaPara('leer quién controla la barrera: la cámara o la plataforma', 'camara');
  try {
    const respuesta = await cliente.pedir(ruta.metodo, ruta.ruta);
    if (!respuesta.ok) {
      const error = interpretarError(respuesta.cuerpo);
      return {
        admisible: false,
        modo: null,
        valorLeido: null,
        detalle: `No se pudo leer el modo de control: ${error.detalle}`,
      };
    }
    return juzgarModo(leerCtrlMod(respuesta.cuerpo));
  } catch (error) {
    if (error instanceof EquipoInalcanzable) {
      return {
        admisible: opciones.inalcanzableEsAdmisible === true,
        modo: null,
        valorLeido: null,
        detalle: `No se pudo alcanzar el equipo: ${error.detalle}`,
      };
    }
    throw error;
  }
};

/** Como la anterior, pero LANZA. Es la que usa el arranque del proveedor. */
export const exigirModoDePlataforma = async (
  opciones: OpcionesDeComprobacion,
): Promise<VeredictoDeModo> => {
  const veredicto = await comprobarModoDeControl(opciones);
  if (!veredicto.admisible) throw new EquipoDecidePorSuCuenta(veredicto);
  return veredicto;
};
