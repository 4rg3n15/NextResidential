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
  /** Específicos del tipo. Nulos donde no aplican. */
  readonly canalBarrera?: number | null;
  readonly numeroDePuerta?: number | null;
  readonly canalDeAudio?: number | null;
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
  readonly canalBarrera: number | null;
  readonly numeroDePuerta: number | null;
  readonly canalDeAudio: number | null;
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
