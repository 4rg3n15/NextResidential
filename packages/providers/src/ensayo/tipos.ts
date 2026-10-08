import type { OpcionesDeEquipo } from '../equipo/cliente';
import type { LimitesDeFoto } from '../terminal/foto-del-rostro';
import type { IpHaciaElEquipo } from '../red/ip-hacia-el-equipo';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * J1 (ETAPA 15-L) · EL ENSAYO EN SITIO, EN SU VOCABULARIO
 *
 * Nueve pasos por equipo, siempre en este orden y siempre los nueve: el que no
 * aplica a una familia se dice («no aplica»), no se salta en silencio. El
 * noveno (F2, corrección de la 15-L) mide la verificación remota. Cada
 * resultado lleva la CAUSA en palabras de quien está delante del equipo y la
 * ACCIÓN que la corrige; nunca un código del fabricante a secas.
 * ═════════════════════════════════════════════════════════════════════════════
 */
export type FamiliaDeEnsayo = 'camara' | 'terminal' | 'videoportero';

export type EstadoDePaso = 'ok' | 'fallo' | 'omitido' | 'no_aplica';

export const PASOS_DEL_ENSAYO = [
  { paso: 'conexion', titulo: 'Conexión y Digest' },
  { paso: 'hora', titulo: 'Hora del equipo frente a la del Mac' },
  { paso: 'configuracion', titulo: 'Lectura de configuración' },
  { paso: 'eventos', titulo: 'Suscripción de eventos' },
  { paso: 'apertura', titulo: 'Apertura con confirmación humana' },
  { paso: 'rostro', titulo: 'Alta y baja de un rostro de prueba' },
  { paso: 'video', titulo: 'Video' },
  { paso: 'audio', titulo: 'Audio' },
  { paso: 'verificacion', titulo: 'Tiempo de la verificación remota' },
] as const;

export type NombreDePaso = (typeof PASOS_DEL_ENSAYO)[number]['paso'];

export interface ResultadoDePaso {
  readonly paso: NombreDePaso;
  /** 1 a 9, el orden del guion. */
  readonly numero: number;
  readonly titulo: string;
  readonly estado: EstadoDePaso;
  /** Qué pasó, en español llano. */
  readonly causa: string;
  /** Qué hacer. `null` cuando no hay nada que hacer. */
  readonly accion: string | null;
  /** Lo que contestó el equipo, ya saneado, para quien quiera mirar más. */
  readonly detalle: readonly string[];
}

/**
 * La persona delante del equipo. En sitio, el terminal; en las pruebas y en
 * `--simulado`, un doble que contesta lo que el simulador sabe.
 */
export interface Interlocutor {
  /** Una instrucción («pulse el timbre»). Vuelve cuando se ha dado. */
  indicar(instruccion: string): Promise<void>;
  /** Una pregunta de sí o no. `null`: nadie contestó. */
  confirmar(pregunta: string): Promise<boolean | null>;
}

export interface EventoVisto {
  readonly titulo: string;
  readonly ocurridoEn: Date;
}

/**
 * Lo que la PLATAFORMA registró. Con la API en marcha, el ensayo no abre una
 * segunda suscripción al equipo —en uno de un solo flujo le quitaría los
 * eventos a la escucha de verdad—: pregunta a la base qué llegó.
 */
export interface EventosDeLaPlataforma {
  primeroDesde(host: string, desde: Date, plazoMs: number): Promise<EventoVisto | null>;
}

/**
 * F2 (corrección de la 15-L) · un veredicto que la plataforma devolvió a la
 * terminal, tal como lo registró la API (`eventos_de_equipo`, tipo
 * `resultado_de_verificacion`): del hecho recibido al veredicto contestado.
 */
export interface VerificacionMedida {
  readonly duracionMs: number;
  /** `aceptadoPorElEquipo`. `null` si la API no lo dijo. */
  readonly aceptado: boolean | null;
}

/** F2 · lo que la plataforma midió de las verificaciones remotas de un equipo. */
export interface VerificacionesDeLaPlataforma {
  /** Las primeras `cuantas` desde `desde`, esperando hasta `plazoMs` a que lleguen. */
  medidasDesde(
    host: string,
    desde: Date,
    cuantas: number,
    plazoMs: number,
  ): Promise<readonly VerificacionMedida[]>;
}

/**
 * C2 (corrección de la 15-L) · a dónde tiene que publicar la cámara para que
 * sus eventos lleguen a ESTE Mac: su IP en la red de la cámara, el puerto de la
 * API y un secreto de `ALARM_SERVER_EQUIPOS` en la ruta. Los secretos sólo se
 * comparan: nunca se imprimen.
 */
export interface ReceptorEsperado {
  readonly direccion: IpHaciaElEquipo;
  readonly puerto: number;
  readonly secretos: readonly string[];
}

export interface EquipoDeEnsayo extends OpcionesDeEquipo {
  readonly familia: FamiliaDeEnsayo;
  /** C6 (15-M) · el nombre de la ficha, cuando el equipo viene del registro (N por familia). */
  readonly nombre?: string;
  /** Carril de la cámara o puerta de la terminal y del videoportero. */
  readonly puerta: number;
  /**
   * El de la ficha o del `.env`. V2 (15-N) · `null` ya no es «102»: el
   * diagnóstico pregunta por uno de los canales que el equipo DECLARA.
   */
  readonly canalDeVideo: string | null;
  readonly puertoRtsp: number;
}

/**
 * E2/C1 (15-M) · el puente de video (go2rtc), si `GO2RTC_URL` está en el
 * `.env`: con él, el paso 7 además negocia WebRTC de verdad. `fetchFn` es
 * inyectable para las pruebas.
 */
export interface PuenteDeEnsayo {
  readonly url: string;
  readonly fetchFn?: typeof fetch;
  /** A3 (15-S2) · `VIDEO_TRANSCODIFICAR` del `.env`; sólo `nunca` la apaga. */
  readonly transcodificar?: string;
}

export interface OpcionesDeEnsayo {
  readonly equipo: EquipoDeEnsayo;
  /** E2/C1 · sin él, el paso 7 se queda en la sonda RTSP y lo dice. */
  readonly puente?: PuenteDeEnsayo;
  readonly interlocutor: Interlocutor;
  /** Sin apertura, sin rostro, sin audio: nada que mueva o escriba. */
  readonly soloLectura: boolean;
  readonly plataforma?: EventosDeLaPlataforma;
  readonly esperaDeEventoMs: number;
  /** JPEG de una cara real para el alta. Sin ella, la imagen sintética. */
  readonly foto?: Uint8Array;
  readonly limitesDeFoto: LimitesDeFoto;
  /** La zona del conjunto: America/Bogota. */
  readonly zona: string;
  readonly ahora: () => Date;
  /** C2 · a dónde debe publicar la cámara. Sin él, el paso 4 no lo compara. */
  readonly receptorEsperado?: ReceptorEsperado;
  /** F2 · los tiempos que registró la plataforma. Sin ellos, el paso 9 se omite. */
  readonly verificaciones?: VerificacionesDeLaPlataforma;
  /** F2 · `TERMINAL_PLAZO_DE_VERIFICACION_S`: tras él, la terminal niega. 8 por omisión. */
  readonly plazoDeVerificacionS?: number;
  /** F2 · cuántas veces se presenta el rostro. 5 por omisión. */
  readonly presentaciones?: number;
  /** C7 · cuánto esperar antes de volver a buscar el rostro de prueba. 60 s por omisión. */
  readonly esperaDeSincronizacionMs?: number;
}

export const resultado = (
  paso: NombreDePaso,
  estado: EstadoDePaso,
  causa: string,
  accion: string | null = null,
  detalle: readonly string[] = [],
): ResultadoDePaso => {
  const i = PASOS_DEL_ENSAYO.findIndex((p) => p.paso === paso);
  return {
    paso,
    numero: i + 1,
    titulo: PASOS_DEL_ENSAYO[i]?.titulo ?? paso,
    estado,
    causa,
    accion,
    detalle,
  };
};

export const ROTULO: Readonly<Record<FamiliaDeEnsayo, string>> = {
  camara: 'Cámara LPR',
  terminal: 'Terminal facial',
  videoportero: 'Videoportero',
};
