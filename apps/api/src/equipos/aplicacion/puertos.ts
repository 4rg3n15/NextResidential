import type { CapacidadesDeEquipo, FichaDelEquipo } from '@ncr/providers';
import type { ContextoTenant } from '../../autenticacion';

/**
 * Aprovisionamiento de equipos desde la consola — A.1 a A.5.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * QUÉ CAMBIA RESPECTO DE LO QUE YA HABÍA
 *
 * Los equipos existían en la base desde la ETAPA 01 y el panel ya los mostraba,
 * pero **entraban a mano**: alguien escribía la fila con `psql`. Un producto
 * multiempresa en el que dar de alta una cámara exige acceso a la base no es un
 * producto. Esto es la puerta que faltaba.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * EL SECRETO ES DE ESCRITURA, Y ESO ES UN TIPO, NO UNA COSTUMBRE
 *
 * `DatosDeEquipo` —lo que sale— **no tiene** campo para el secreto. No está
 * enmascarado ni vacío: no existe. Es la diferencia entre «acordarse de no
 * devolverlo» y «no poder devolverlo», y es la única versión que sobrevive a
 * que alguien añada un campo al DTO dentro de seis meses.
 */

export const REPOSITORIO_DE_EQUIPOS = Symbol.for('ncr.puerto.RepositorioDeEquipos');
export const SONDA_DE_EQUIPO = Symbol.for('ncr.puerto.SondaDeEquipo');

export const TIPOS_DE_EQUIPO = [
  'camara_lpr',
  'terminal_facial',
  'intercom',
  'rele',
  'controlador_io',
] as const;
export type TipoDeEquipo = (typeof TIPOS_DE_EQUIPO)[number];

export type ProtocoloDeEquipo = 'http' | 'https';
export type EstadoDeVerificacion = 'no_verificado' | 'verificado' | 'rechazado';
/** Lo que la terminal facial DECLARA ser. Se declara, no se deduce (D2). */
export type ModoDeTerminalDeclarado = 'reporta_y_espera' | 'decide_el_equipo';

/**
 * Lo que la consola ENVÍA al dar de alta o editar. El secreto viaja aquí y no
 * vuelve a salir por ninguna parte.
 */
export interface AltaDeEquipo {
  readonly nombre: string;
  readonly tipo: TipoDeEquipo;
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: ProtocoloDeEquipo;
  readonly usuario: string;
  /** `undefined` al editar = «no lo cambies». Nunca significa «bórralo». */
  readonly secreto?: string;
  readonly modelo?: string | null;
  /** INFORMATIVO (O2): se muestra y se audita; ninguna decisión lo mira. */
  readonly fabricante?: string | null;
  /** Específicos del tipo. Nulos donde no aplican. */
  readonly canalBarrera?: number | null;
  readonly numeroDePuerta?: number | null;
  readonly canalDeAudio?: number | null;
  readonly modoDeTerminal?: ModoDeTerminalDeclarado | null;
  /** Si una persona habilitó el canal de audio EN EL APARATO (ADR-01). */
  readonly canalDeAudioHabilitado?: boolean;
}

/** Lo que la consola RECIBE. Sin secreto, por construcción. */
export interface DatosDeEquipo {
  readonly id: string;
  readonly nombre: string;
  readonly tipo: TipoDeEquipo;
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: ProtocoloDeEquipo;
  readonly usuario: string | null;
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly fabricante: string | null;
  readonly canalBarrera: number | null;
  readonly numeroDePuerta: number | null;
  readonly canalDeAudio: number | null;
  readonly modoDeTerminal: ModoDeTerminalDeclarado | null;
  readonly canalDeAudioHabilitado: boolean;
  /**
   * Lo que el equipo declara poder hacer, descubierto al sondearlo y
   * PERSISTIDO: es lo que el proveedor mira antes de pedirle algo (O2). `null`
   * cuando nunca se sondeó con éxito.
   */
  readonly capacidades: CapacidadesDeEquipo | null;
  readonly verificacion: EstadoDeVerificacion;
  readonly verificadoEn: string | null;
  readonly motivoNoVerificado: string | null;
  readonly estado: 'activo' | 'inactivo';
}

/**
 * El contexto viaja en cada llamada, no en el constructor. §2.7.6 lo exige por
 * partida doble: la RLS necesita los claims de ESTA petición, y el filtro de
 * aplicación —el único que protege las rutas que usan la llave secreta, porque
 * esa omite la RLS— necesita saber quién pregunta.
 */
export interface RepositorioDeEquipos {
  listar(ctx: ContextoTenant, copropiedadId: string): Promise<readonly DatosDeEquipo[]>;
  crear(
    ctx: ContextoTenant,
    copropiedadId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo>;
  editar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    alta: AltaDeEquipo,
    veredicto: ResultadoDeSondeo,
  ): Promise<DatosDeEquipo | null>;
  /** Baja lógica con motivo: nunca borrado físico (RN-19). */
  desactivar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
    motivo: string,
  ): Promise<DatosDeEquipo | null>;
  reactivar(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<DatosDeEquipo | null>;
  /**
   * La credencial descifrada, **sólo para hablar con el equipo**.
   *
   * No sale por ninguna ruta HTTP: el DTO de lectura ni declara el campo. Está
   * en el puerto porque corregir la configuración de un aparato exige
   * presentarle su clave, y la alternativa —pedírsela otra vez al operador cada
   * vez— haría que nadie corrigiera nada.
   */
  credencialPara(
    ctx: ContextoTenant,
    copropiedadId: string,
    equipoId: string,
  ): Promise<string | null>;
  /** Constancia de una corrección aplicada: qué cambió, de qué valor a cuál. */
  auditarCorreccion(ctx: ContextoTenant, copropiedadId: string, detalle: string): Promise<void>;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * CORREGIR LA CONFIGURACIÓN DE UN EQUIPO DESDE LA CONSOLA
 *
 * El diagnóstico dice qué está mal y cuál debería ser el valor. Sin esto, el
 * operador tiene que ir al panel del aparato, encontrar el campo y cambiarlo a
 * mano — y en un conjunto con doce cámaras eso no lo hace nadie.
 *
 * **Nada de esto se aplica solo.** Cambiar quién controla una barrera es la
 * clase de acción que nadie ve venir si la hace un arranque automático: hace
 * falta confirmación explícita de una persona, y queda constancia de quién,
 * cuándo y de qué valor a cuál.
 */
export const CORRECTOR_DE_EQUIPO = Symbol.for('ncr.puerto.CorrectorDeEquipo');

export const CORRECCIONES = [
  'modo_de_control',
  'pais_del_algoritmo',
  'imagenes_del_receptor',
  'formato_del_receptor',
] as const;
export type CorreccionDeEquipo = (typeof CORRECCIONES)[number];

export interface DatosDeCorreccion {
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: ProtocoloDeEquipo;
  readonly usuario: string;
  readonly secreto: string;
  readonly correccion: CorreccionDeEquipo;
  /** Quién la autoriza. Sin esto no se emite la petición al equipo. */
  readonly confirmadaPor: string;
}

export interface ResultadoDeCorreccionDeEquipo {
  readonly correccion: CorreccionDeEquipo;
  readonly aplicada: boolean;
  readonly valorAnterior: string | null;
  readonly valorNuevo: string | null;
  readonly detalle: string;
}

export interface CorrectorDeEquipo {
  corregir(datos: DatosDeCorreccion): Promise<ResultadoDeCorreccionDeEquipo>;
}

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * A.3 · CUATRO RESULTADOS DISTINTOS, Y NINGUNO GENÉRICO
 *
 * «No se pudo conectar» manda a revisar cuatro cosas a la vez. Cada uno de
 * estos cuatro se resuelve de una manera y sólo de una:
 *
 *  · `alcanzado`        — contesta y autentica. Se guardan modelo y firmware.
 *  · `decide_solo`      — contesta, autentica, y `ctrlMod` ≠ 1: la cámara abre
 *                         por su cuenta. **Es un hallazgo de bloqueo**, no un
 *                         detalle: con la cámara decidiendo, el motor de reglas
 *                         queda decorativo y se pierde la trazabilidad.
 *  · `credencial`       — el equipo rechaza el usuario o la clave. Se avisa de
 *                         que estos aparatos BLOQUEAN la cuenta tras unos pocos
 *                         intentos: aquí no se reintenta en bucle.
 *  · `inalcanzable`     — no contesta. Se nombran host y puerto, jamás el
 *                         secreto.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type ClaseDeSondeo = 'alcanzado' | 'decide_solo' | 'credencial' | 'inalcanzable';

export interface ResultadoDeSondeo {
  readonly clase: ClaseDeSondeo;
  /** Texto para la pantalla. Sin credencial y sin jerga. */
  readonly detalle: string;
  readonly modelo: string | null;
  readonly firmware: string | null;
  readonly latenciaMs: number | null;
  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * LA FICHA · lo que la consola enseña del equipo, añadido en la 15-C
   *
   * Los cuatro desenlaces dicen si se puede operar. La ficha dice **qué hay que
   * cambiar**, campo por campo, con el valor leído, el que debería tener y si
   * hay un botón que lo arregle. Sin ella, «la cámara decide por su cuenta»
   * manda a recorrer la interfaz del aparato buscando cuál de tres cosas es.
   *
   * `undefined` cuando no se sondeó: la ausencia de ficha no es una ficha vacía.
   */
  readonly ficha?: FichaDelEquipo;
  /**
   * Las capacidades DESCUBIERTAS en el aparato durante el sondeo (O2). Se
   * persisten con el alta. Ausentes cuando no se alcanzó el equipo.
   */
  readonly capacidades?: CapacidadesDeEquipo;
  /**
   * `true` sólo con `alcanzado`. Guardar un equipo que no contesta es legítimo
   * —se instala el lunes— pero queda NO VERIFICADO y se dice por qué.
   */
  readonly verificado: boolean;
}

export interface DatosDeSondeo {
  readonly host: string;
  readonly puerto: number;
  readonly protocolo: ProtocoloDeEquipo;
  readonly usuario: string;
  readonly secreto: string;
  readonly tipo: TipoDeEquipo;
  /** Carril de la cámara, si se declaró. */
  readonly canalBarrera?: number | null;
}

export interface SondaDeEquipo {
  probar(datos: DatosDeSondeo): Promise<ResultadoDeSondeo>;
}

/** El veredicto de quien guarda sin probar: honesto y explícito. */
export const SIN_PROBAR: ResultadoDeSondeo = {
  clase: 'inalcanzable',
  detalle: 'Guardado sin comprobar contra el equipo',
  modelo: null,
  firmware: null,
  latenciaMs: null,
  verificado: false,
};
