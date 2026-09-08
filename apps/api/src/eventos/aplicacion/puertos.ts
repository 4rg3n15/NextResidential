import type { Acceso, Alerta, FiltroDeEventos, TipoDeEvento } from '@ncr/domain-core';
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

export interface RepositorioAlertas {
  guardar(alerta: Alerta, actorId: string): Promise<void>;
  porId(copropiedadId: string, alertaId: string): Promise<Alerta | null>;
  abiertasDe(copropiedadId: string): Promise<readonly Alerta[]>;
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

export interface RepositorioDispositivos {
  latidos(copropiedadId: string): Promise<readonly LatidoDeDispositivo[]>;
  registrarLatido(copropiedadId: string, dispositivoId: string, ahora: Date): Promise<void>;
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
export const REPOSITORIO_DISPOSITIVOS = Symbol.for('ncr.puerto.RepositorioDispositivos');
export const CANAL_TIEMPO_REAL = Symbol.for('ncr.puerto.CanalTiempoReal');
export const NOTIFICADOR_PUSH = Symbol.for('ncr.puerto.NotificadorPush');

/** Temas del canal. Se enumeran para que consola y API no se desincronicen. */
export const TEMA_EVENTOS = 'eventos';
export const TEMA_ALERTAS = 'alertas';
