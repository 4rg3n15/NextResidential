import type {
  Acceso,
  Alerta,
  EstadoDeAlerta,
  FiltroDeEventos,
  Severidad,
  TipoDeAlerta,
  TipoDeEvento,
} from '@ncr/domain-core';
import type { MotivoAcceso, ResultadoAcceso } from '@ncr/domain-core';

/**
 * Puertos del módulo de eventos. La aplicación los DEFINE; la infraestructura
 * los cumple (§2.2, DIP).
 *
 * **La frontera es definitiva aunque el adaptador no lo sea.** Este entorno no
 * tiene contraseña de PostgreSQL, así que la API arranca con el adaptador en
 * memoria; el adaptador PostgreSQL existe, implementa este mismo puerto y se
 * prueba contra una base real. Lo que no puede cambiar cuando llegue la
 * contraseña es esta interfaz: si cambiara, la etapa habría diseñado contra el
 * doble en vez de contra el contrato, que es justo lo que D-25 advierte.
 */

/**
 * `anexar` no es `guardar`. Un evento no se crea-o-actualiza: se añade, y si ya
 * estaba, el resultado lo dice en vez de sobrescribir. RN-17 y CA-22 dependen
 * de que el segundo intento sea distinguible del primero **sin** consultar
 * antes: la unicidad la resuelve la base en la misma sentencia (ADR-04).
 */
export type ResultadoAnexado =
  | { readonly tipo: 'anexado'; readonly id: string }
  | { readonly tipo: 'duplicado'; readonly id: string };

/** Fila del histórico tal como la consumen las pantallas (HU-32). */
export interface EventoRegistrado {
  readonly id: string;
  readonly copropiedadId: string;
  readonly ocurridoEn: Date;
  readonly tipo: TipoDeEvento;
  readonly resultado: 'permitido' | 'negado';
  readonly motivo: MotivoAcceso | null;
  readonly metodo: string;
  readonly personaId: string | null;
  readonly viviendaId: string | null;
  readonly zonaId: string | null;
  readonly dispositivoId: string;
  readonly placaDetectada: string | null;
  readonly confianza: number | null;
  readonly reglaAplicada: string;
  readonly versionReglas: number;
  readonly operadorId: string | null;
  readonly motivoManual: string | null;
  readonly evidenciaId: string | null;
  readonly decididoPorEdge: boolean;
  /** R2 (15-N) · cuándo lo guardó la plataforma (`registrado_en`). Opcional: dobles antiguos. */
  readonly registradoEn?: Date;
}

export interface PaginaDeEventos {
  readonly filas: readonly EventoRegistrado[];
  /** Cursor opaco de la siguiente página, o `null` si no hay más. */
  readonly siguiente: string | null;
}

export interface RepositorioEventos {
  anexar(acceso: Acceso, actorId: string): Promise<ResultadoAnexado>;
  consultar(filtro: FiltroDeEventos): Promise<PaginaDeEventos>;
  porId(copropiedadId: string, eventoId: string): Promise<EventoRegistrado | null>;
}

/** E5 (15-M) · lo justo de la última alerta de un (equipo, tipo, clave) para deduplicar. */
export interface UltimaAlerta {
  readonly id: string;
  readonly generadaEn: Date;
  readonly estado: EstadoDeAlerta;
  readonly archivada: boolean;
}

/** E5 (15-M) · filtros de la cola de alertas de la consola. */
export interface FiltroDeAlertas {
  readonly dispositivoId?: string | null;
  readonly severidad?: Severidad | null;
  readonly tipo?: TipoDeAlerta | null;
  /** A2 (15-N) · por fecha de generación: `[desde, hasta)`. */
  readonly desde?: Date | null;
  readonly hasta?: Date | null;
}

export interface RepositorioAlertas {
  guardar(alerta: Alerta, actorId: string): Promise<void>;
  porId(copropiedadId: string, alertaId: string): Promise<Alerta | null>;
  /** Abiertas y en atención, NO archivadas, con filtros opcionales. */
  abiertasDe(copropiedadId: string, filtro?: FiltroDeAlertas): Promise<readonly Alerta[]>;
  /**
   * La más reciente del mismo equipo y tipo —y clave, si se da: el prefijo
   * `[clave]` de las notas—, archivada o no. `null` si nunca hubo.
   */
  ultimaDe(
    copropiedadId: string,
    dispositivoId: string,
    tipo: TipoDeAlerta,
    clave?: string,
  ): Promise<UltimaAlerta | null>;
  /**
   * Archivo LÓGICO con motivo y autor (RN-19): la fila queda; deja de listarse.
   * Devuelve cuántas se archivaron (las ya archivadas o ajenas no cuentan).
   */
  archivar(
    copropiedadId: string,
    alertaIds: readonly string[],
    motivo: string,
    actorId: string,
    ahora: Date,
  ): Promise<number>;
}

/**
 * Canal de tiempo real hacia las consolas.
 *
 * `publicar` devuelve **a cuántos destinatarios llegó**, y eso no es un detalle
 * de telemetría: KPI-25 exige que la alerta llegue al operador en menos de 10 s,
 * y una publicación a cero suscriptores es un no-envío que un `Promise<void>`
 * dejaría indistinguible de un envío correcto. Es la diferencia entre medir el
 * indicador y suponerlo.
 *
 * El puerto no nombra ningún transporte. Esa es la salida de la contingencia
 * documentada en `docs/arquitectura/tiempo-real-y-contingencia.md`: si Supabase
 * Realtime no alcanza el umbral, se cambia el adaptador y no la aplicación.
 */
export interface CanalTiempoReal {
  publicar(copropiedadId: string, tema: string, carga: unknown): Promise<number>;
}

/** HU-34 · aviso al residente. El transporte real (FCM) llega con la ETAPA 11. */
export interface NotificadorPush {
  aVivienda(
    copropiedadId: string,
    viviendaId: string,
    titulo: string,
    cuerpo: string,
  ): Promise<number>;
}

/** Latido de dispositivos, para la vigilancia de CA-26. */
export interface LatidoDeDispositivo {
  readonly dispositivoId: string;
  readonly copropiedadId: string;
  readonly ultimoLatido: Date | null;
}

/** E5 (15-M) · lo que el latido supo del equipo, para escribirlo en la base (0044). */
export interface EstadoObservado {
  readonly estadoSalud: 'saludable' | 'degradado' | 'caido';
  /** `null` cuando no se sondeó (bastó la señal de la escucha). */
  readonly sondeo: 'alcanzado' | 'credencial' | 'inalcanzable' | null;
  readonly credencialRechazada: boolean;
}

export interface RepositorioDispositivos {
  latidos(copropiedadId: string): Promise<readonly LatidoDeDispositivo[]>;
  registrarLatido(copropiedadId: string, dispositivoId: string, ahora: Date): Promise<void>;
  /**
   * E5 (15-M) · escribe `estado_salud` CON LA REALIDAD que el latido observó
   * (antes nadie lo escribía: valía `saludable` en un equipo inalcanzable).
   */
  registrarEstado(
    copropiedadId: string,
    dispositivoId: string,
    observado: EstadoObservado,
    ahora: Date,
  ): Promise<void>;
}

/**
 * Puerto hacia el motor de decisión.
 *
 * Lo declara el CONSUMIDOR, que es este módulo: el de eventos necesita que
 * alguien decida, y no le importa quién. Así el módulo de autorizaciones no
 * aparece en ningún `import` de esta capa (§2.2: los módulos se comunican por
 * interfaces), y la ETAPA 12 puede enchufar aquí la decisión local del Edge sin
 * tocar una línea del caso de uso.
 */
export interface MotorDeDecision {
  decidir(solicitud: {
    copropiedadId: string;
    dispositivoId: string;
    metodo: 'placa' | 'facial' | 'manual' | 'remoto' | 'tarjeta';
    personaId: string | null;
    placaLeida: string | null;
    zonaId: string | null;
    confianza: number;
  }): Promise<ResultadoAcceso>;
}

export const MOTOR_DE_DECISION = Symbol.for('ncr.puerto.MotorDeDecision');

export const REPOSITORIO_EVENTOS = Symbol.for('ncr.puerto.RepositorioEventos');
export const REPOSITORIO_ALERTAS = Symbol.for('ncr.puerto.RepositorioAlertas');

/**
 * El escalamiento de alertas, publicado como PUERTO y no como clase.
 *
 * La ETAPA 10 lo necesita desde `guardia` —la emergencia y el aviso al
 * residente escalan por el mismo camino que la ingesta—, y hacerlo importando
 * la clase obligaría a entrar en `eventos/aplicacion/…`, que es justo lo que
 * §2.2 prohíbe. Con un token, `guardia` depende de una forma y la raíz de
 * composición las une.
 */
export const ESCALAMIENTO_DE_ALERTA = Symbol.for('ncr.puerto.EscalamientoDeAlerta');
export const REPOSITORIO_DISPOSITIVOS = Symbol.for('ncr.puerto.RepositorioDispositivos');
export const CANAL_TIEMPO_REAL = Symbol.for('ncr.puerto.CanalTiempoReal');
export const NOTIFICADOR_PUSH = Symbol.for('ncr.puerto.NotificadorPush');

/** Temas del canal. Se enumeran para que consola y API no se desincronicen. */
export const TEMA_EVENTOS = 'eventos';
export const TEMA_ALERTAS = 'alertas';
/** A4 (15-E) · la llamada del videoportero: aviso emergente a las consolas. */
export const TEMA_LLAMADAS = 'llamadas';
