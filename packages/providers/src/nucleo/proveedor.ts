import type {
  AccessPointProvider,
  EstadoSesionIntercom,
  FaceTemplateProvider,
  IntercomProvider,
  PlateEventSource,
  ResultadoAccionamiento,
  ResultadoDeAccionamiento,
} from '@ncr/domain-core';

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * C6 (ETAPA 15-M) · UNA SESIÓN DE AUDIO POR VIDEOPORTERO, NO UNA POR PROCESO
 *
 * El puerto del dominio `IntercomProvider` abre la sesión por dispositivo pero
 * envía, recibe, cierra y consulta SIN decir cuál: nació cuando había un solo
 * videoportero. Con N equipos eso obligaba al adaptador a recordar «la» sesión
 * (un `enSesion` único), y el segundo videoportero pisaba al primero.
 *
 * Esto NO cambia el dominio (que sigue expresando intención sin protocolo):
 * añade, en el tipo del paquete, la forma con dispositivo. Un adaptador que la
 * implementa mantiene UNA sesión por equipo (exclusividad por equipo, ADR-01);
 * los métodos del puerto sin dispositivo siguen funcionando mientras haya una
 * sola sesión abierta, que es el caso de siempre, y se niegan cuando hay
 * varias, porque adivinar a qué videoportero va el audio no es una opción.
 */
export interface IntercomPorEquipo {
  enviarAudioA(dispositivoId: string, fragmento: Uint8Array): Promise<void>;
  recibirAudioDe(dispositivoId: string): AsyncIterable<Uint8Array>;
  cerrarSesionDe(dispositivoId: string, motivo: string): Promise<void>;
  estadoSesionDe(dispositivoId: string): Promise<EstadoSesionIntercom>;
}
import type { CapacidadesDeEquipo } from './capacidades';
import type { EscuchaActiva, TransporteDeEscucha } from './escucha';
import type { OrigenDeVideo } from './video';
import type { VeredictoRemoto } from './verificacion-remota';

/**
 * LO QUE TODO ADAPTADOR CUMPLE: los cuatro puertos del dominio, más UNA
 * pregunta que el dominio no hace y este paquete sí.
 *
 * `capacidadesDe` no es un puerto del dominio y no lo será: el motor de reglas
 * no necesita saber si un equipo tiene biblioteca de rostros. Quien lo necesita
 * es la composición —qué se le pide a qué aparato— y la consola —qué enseñar—.
 * Vive aquí, en el tipo del paquete, y la suite de contrato lo exige igual a
 * los tres adaptadores.
 */
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * `fijarBloqueo` · ETAPA 15-E · TAMPOCO ES UN PUERTO DEL DOMINIO, Y SE DICE
 *
 * El dominio declara `ControlDeBarrera` con las dos operaciones —accionar y
 * bloquear (H-3)— para el adaptador de barrera. `AccessPointProvider`, el
 * puerto que la API consume por dispositivo, sólo sabe abrir. Hasta la 15-E el
 * bloqueo llegaba al equipo por un segundo camino: el control de barrera que
 * `BARRERA_*` construye por entorno, para UN dispositivo. Con el registro de
 * equipos (D5) ese camino queda como compatibilidad, y el bloqueo tiene que
 * poder resolverse por dispositivo y por capacidad como todo lo demás.
 *
 * Se declara aquí y no en el dominio por la misma razón que `capacidadesDe`:
 * el motor de reglas no bloquea accesos; lo hace la administración (H-3), y el
 * puerto que la consola consume es de aplicación. Los tres adaptadores lo
 * cumplen y la suite de contrato lo exige: `bloqueoDeAcceso = si` → orden
 * aceptada; en otro caso `CapacidadNoSoportada`, nunca una orden que «pasa».
 */
export type ProveedorDeEquipos = AccessPointProvider &
  PlateEventSource &
  FaceTemplateProvider &
  IntercomProvider & {
    capacidadesDe(dispositivoId: string): Promise<CapacidadesDeEquipo>;
    fijarBloqueo(dispositivoId: string, bloqueado: boolean): Promise<ResultadoDeAccionamiento>;
    /**
     * A2 · contesta a una terminal que reconoció y ESPERA (`verificacionRemota`).
     * Con `permitido` el equipo abre; sin él, niega. Sólo se admite en un equipo
     * que declare la capacidad; en otro caso `CapacidadNoSoportada`.
     */
    responderVerificacionRemota(
      dispositivoId: string,
      veredicto: VeredictoRemoto,
    ): Promise<ResultadoAccionamiento>;
    /**
     * A4 · abre y mantiene la escucha de lo que el equipo EMITE —llamadas,
     * rostros, timbres— y lo publica en la fuente compartida. Devuelve cómo
     * quedó (transporte elegido por capacidad, o `ninguna` con su motivo) y
     * cómo detenerla. Un equipo desconocido rechaza.
     */
    escuchar(dispositivoId: string): Promise<EscuchaActiva>;
    /**
     * A5 · el origen RTSP del video de un equipo, para el puente de video del
     * servidor. `null` cuando el equipo no tiene video (relé, controlador) o
     * el proveedor no lo puede construir (simulado). Un equipo desconocido
     * rechaza. La credencial va dentro: nunca cruza a la presentación.
     */
    origenDeVideo(dispositivoId: string): Promise<OrigenDeVideo | null>;
    /**
     * A4 (15-L) · ¿el equipo decide por su cuenta —una cámara sin control de la
     * plataforma y sin atestación—? `null` si no se sabe. Lo pregunta el
     * receptor DESPUÉS de registrar la lectura, para marcarla «la cámara
     * decidió por su cuenta»: nunca delante de una apertura. Opcional: el
     * simulado no lo implementa.
     */
    decideSolo?(dispositivoId: string): Promise<boolean | null>;
    /**
     * C1 (15-L) · olvida todo lo que el proceso recuerda de un equipo
     * —clientes con su dirección y credencial, capacidades, puerta, veredicto
     * de control— y cierra su escucha. Tras editar un equipo, la siguiente
     * orden y la siguiente escucha usan lo guardado, sin reiniciar la API.
     */
    olvidar?(dispositivoId: string): void;
    /**
     * C3 (15-L) · la escucha del equipo, si la hay: por qué transporte y cuándo
     * mandó algo por última vez. Es la respuesta REAL del equipo en cuanto a
     * eventos, sin abrir una segunda conexión que podría quitarle los suyos a
     * la escucha de la plataforma.
     */
    senalDeEventos?(dispositivoId: string): {
      readonly transporte: TransporteDeEscucha;
      readonly ultimaSenal: Date | null;
      /** C7 (15-L) · la conexión la tiene otra plataforma: la frase con el remedio. */
      readonly rechazo: string | null;
    } | null;
    /** C6 (15-M) · la sesión de audio POR EQUIPO. Ver `IntercomPorEquipo`. */
    enviarAudioA?(dispositivoId: string, fragmento: Uint8Array): Promise<void>;
    recibirAudioDe?(dispositivoId: string): AsyncIterable<Uint8Array>;
    cerrarSesionDe?(dispositivoId: string, motivo: string): Promise<void>;
    estadoSesionDe?(dispositivoId: string): Promise<EstadoSesionIntercom>;
  };
