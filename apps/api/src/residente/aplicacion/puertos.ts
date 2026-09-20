/**
 * Puerto del directorio del residente — la superficie que la app móvil lee.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ ES UN PUERTO NUEVO Y NO TRES MÉTODOS MÁS EN `RepositorioPadron`
 *
 * §2.3 (ISP) y la frontera de §2.2. `RepositorioPadron` responde preguntas de
 * administración —listar el conjunto entero, generar, exportar, desactivar— y
 * todas reciben `copropiedadId` porque ese es su ámbito. Las de aquí reciben
 * **el ámbito del residente**, que es una vivienda, y ninguna admite que el
 * llamante nombre otra. Mezclarlas dejaría en un mismo puerto dos operaciones
 * cuyo alcance se parece lo suficiente para confundirse en una revisión: es
 * exactamente el error que se quiere imposibilitar.
 *
 * Además obliga a lo que importa: aquí **no hay un solo método que reciba un
 * `viviendaId` desde fuera**. El vínculo se resuelve con `vinculoDe`, a partir
 * de la identidad, y el resto recibe el ámbito ya construido por el dominio.
 */
import type {
  AmbitoDelResidente,
  HechosParaAutorizar,
  MotivoDeNoAutorizar,
} from '@ncr/domain-core';

export const DIRECTORIO_DEL_RESIDENTE = Symbol('DIRECTORIO_DEL_RESIDENTE');

/** El vínculo activo entre una identidad y su vivienda. */
export interface VinculoDeResidente {
  readonly copropiedadId: string;
  readonly viviendaId: string;
  readonly residenteId: string;
  readonly personaId: string;
  readonly esTitular: boolean;
  /** `[SUPUESTO]` P-11: por defecto el más restrictivo (`SoloIngreso`). */
  readonly nivelAcceso: string | null;
}

export interface ViviendaDelResidente {
  readonly id: string;
  readonly identificador: string;
  readonly agrupacion: string | null;
  /** Cómo llama ESTA copropiedad a sus viviendas y a sus agrupaciones (0029). */
  readonly etiquetaVivienda: string;
  readonly etiquetaAgrupacion: string;
  readonly direccion: string | null;
  readonly copropiedadNombre: string;
  /** Alimentado externamente; Next Control no calcula cartera (S-01). */
  readonly estadoAdministrativo: string;
  /** RN-13: una vivienda inactiva conserva lo vigente y no genera nuevo. */
  readonly activa: boolean;
}

export interface MiembroDeFamilia {
  readonly residenteId: string;
  readonly nombre: string;
  readonly parentesco: string | null;
  readonly esTitular: boolean;
  readonly nivelAcceso: string | null;
  readonly activo: boolean;
}

export interface VehiculoDelResidente {
  readonly id: string;
  readonly placa: string;
  readonly marca: string | null;
  readonly modelo: string | null;
  readonly color: string | null;
  readonly esPrincipal: boolean;
  readonly activo: boolean;
}

export interface AutorizacionDelResidente {
  readonly id: string;
  readonly visitante: string;
  readonly tipo: string;
  readonly desde: string;
  readonly hasta: string;
  readonly placa: string | null;
  readonly permiteAccesoVehicular: boolean;
  readonly estado: string;
  readonly acompanantes: number;
}

export interface EventoDelResidente {
  readonly id: string;
  readonly ocurridoEn: string;
  readonly tipo: string;
  readonly resultado: string | null;
  /** El residente tiene derecho a entender la negación (mockup M-6). */
  readonly motivo: string | null;
  readonly metodo: string;
  readonly placaDetectada: string | null;
  readonly persona: string | null;
  readonly zona: string | null;
  readonly decididoPorEdge: boolean;
}

export interface FiltroDeHistorial {
  /** `hoy` · `semana` · `mes` · `todo`, como los chips del mockup M-6. */
  readonly periodo: 'hoy' | 'semana' | 'mes' | 'todo';
  readonly limite: number;
}

/**
 * Lo que el residente quiere crear, tal como sale de la pantalla M-4.
 *
 * `viviendaId` NO está aquí y no es un olvido: lo pone el adaptador desde el
 * ámbito. Si estuviera, el puerto admitiría que alguien lo pasara.
 */
export interface NuevaAutorizacion {
  /** Nombre del visitante. La persona se crea si no existe (find-or-create). */
  readonly visitante: string;
  /** Documento, si el residente lo conoce; es lo que cruza la lista negra. */
  readonly documento: string | null;
  readonly desde: string;
  readonly hasta: string;
  readonly placa: string | null;
  readonly permiteAccesoVehicular: boolean;
  /** HU-08 · acompañantes NOMINALES: nombre por nombre, no un número. */
  readonly acompanantes: readonly string[];
  readonly zonasPermitidas: readonly string[];
  readonly observaciones: string | null;
  /** HU-09 · RN-22 · días y franja; nulo para una visita única. */
  readonly patron: {
    readonly dias: readonly number[];
    readonly minutoInicio: number;
    readonly minutoFin: number;
    readonly desplazamientoUtcMinutos: number;
  } | null;
  /**
   * CLAVE DE IDEMPOTENCIA del modo sin conexión (RN-17).
   *
   * La app la genera ANTES de intentar el envío y la reusa en cada reintento.
   * Sin ella, un residente en el ascensor con mala cobertura crea la misma
   * visita tres veces y el portero ve tres autorizaciones idénticas.
   */
  readonly claveDeIdempotencia: string;
}

/** Zona común tal como la ve el residente (M-5). */
export interface ZonaParaResidente {
  readonly id: string;
  readonly nombre: string;
  /** Lo que la base garantiza; la interfaz solo lo refleja. */
  readonly aforoMaximo: number;
  readonly ocupacionActual: number;
  readonly abiertaAhora: boolean;
  /** Franjas de HOY, ya resueltas; el cruce de medianoche viene aplanado. */
  readonly franjasDeHoy: readonly { readonly desde: string; readonly hasta: string }[];
  readonly requiereAutorizacion: boolean;
}

/**
 * Todas las lecturas de la app del residente.
 *
 * Ni un método recibe `viviendaId` como argumento del cliente: reciben el
 * `AmbitoDelResidente` que `ambitoDelResidente()` construyó desde el vínculo.
 * Un adaptador no puede, por tanto, ser llamado con la vivienda del vecino sin
 * que el ámbito lo diga — y el ámbito no sale de la petición.
 */
export interface DirectorioDelResidente {
  /** Resuelve identidad → vivienda. Es el único punto donde nace el ámbito. */
  vinculoDe(usuarioId: string): Promise<VinculoDeResidente | null>;
  vivienda(ambito: AmbitoDelResidente): Promise<ViviendaDelResidente | null>;
  familia(ambito: AmbitoDelResidente): Promise<readonly MiembroDeFamilia[]>;
  vehiculos(ambito: AmbitoDelResidente): Promise<readonly VehiculoDelResidente[]>;
  autorizaciones(ambito: AmbitoDelResidente): Promise<readonly AutorizacionDelResidente[]>;
  historial(
    ambito: AmbitoDelResidente,
    filtro: FiltroDeHistorial,
  ): Promise<readonly EventoDelResidente[]>;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TRES PUERTOS MÁS, Y NO TRES MÉTODOS MÁS EN EL DE ARRIBA
 *
 * §2.3 (ISP). `DirectorioDelResidente` responde «qué hay en mi vivienda» y lo
 * hace con seis lecturas que comparten adaptador, consulta y prueba. Lo que
 * añade 11-B son tres preguntas de naturaleza distinta —escribir una
 * autorización, mirar el aforo de una zona común, guardar el token de un
 * aparato—, y meterlas en el mismo puerto habría producido una interfaz de diez
 * métodos que ningún consumidor usa entera: el doble de pruebas tendría que
 * implementar métodos que no le importan, y ahí es donde acaban los `throw new
 * NotImplemented` que §2.3 prohíbe.
 *
 * La regla del ámbito no cambia en ninguno: **ningún método recibe un
 * `viviendaId` de fuera**.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const ZONAS_DEL_RESIDENTE = Symbol('ZONAS_DEL_RESIDENTE');
export const AUTORIZACIONES_DEL_RESIDENTE = Symbol('AUTORIZACIONES_DEL_RESIDENTE');
export const NOTIFICACIONES_DEL_RESIDENTE = Symbol('NOTIFICACIONES_DEL_RESIDENTE');

export interface ZonasDelResidente {
  /** M-5 · zonas con su aforo y su horario, ya resueltos para AHORA. */
  zonas(ambito: AmbitoDelResidente, ahora: Date): Promise<readonly ZonaParaResidente[]>;
}

/**
 * Los hechos que SOLO la base conoce. El cuarto —si el vínculo permite
 * autorizar— no está aquí a propósito: lo sabe el vínculo que el caso de uso ya
 * resolvió, y volver a preguntárselo a la base habría creado dos verdades sobre
 * el mismo dato, que es de donde salen las incoherencias caras.
 */
export type HechosDeLaBase = Omit<HechosParaAutorizar, 'vinculoPuedeAutorizar'>;

export interface AutorizacionesDelResidente {
  /**
   * Los cuatro hechos que deciden si se puede autorizar (RN-06, RN-13, P-11,
   * RN-04). Es UN método y no cuatro a propósito: los cuatro se responden en la
   * misma ida a la base, y separarlos invitaría a que un caso de uso futuro
   * preguntara tres y olvidara el cuarto.
   */
  hechosParaAutorizar(
    ambito: AmbitoDelResidente,
    consulta: { readonly documento: string | null; readonly placa: string | null },
  ): Promise<HechosDeLaBase>;

  /**
   * Escribe la autorización. Devuelve `PLACA_DUPLICADA` cuando el índice único
   * parcial la rechaza: la comprobación previa reduce la carrera, la base la
   * cierra (ADR-04), y el residente lee el mismo motivo por los dos caminos.
   *
   * Con una clave de idempotencia ya usada devuelve la autorización ANTERIOR,
   * no una nueva ni un error: es lo que convierte el reintento del modo sin
   * conexión en algo seguro de repetir (RN-17).
   */
  crearAutorizacion(
    ambito: AmbitoDelResidente,
    creadaPor: { readonly usuarioId: string; readonly residenteId: string },
    nueva: NuevaAutorizacion,
  ): Promise<
    | { readonly ok: true; readonly id: string; readonly repetida: boolean }
    | { readonly ok: false; readonly motivo: MotivoDeNoAutorizar }
  >;

  /**
   * Quién es el TITULAR del dato biométrico de esta autorización.
   *
   * Existe por RN-10 y por una sola razón: que el identificador del titular
   * **no pueda venir del cuerpo de la petición**. Si la app lo enviara, un
   * residente podría capturar un rostro y colgárselo a cualquiera —a su vecino,
   * a sí mismo—, y el consentimiento quedaría pedido a la persona equivocada.
   *
   * Devuelve `null` cuando la autorización no es de esta vivienda, que es
   * también como se cierra el segundo eje: no hay forma de nombrar la
   * autorización del vecino y obtener a su visitante.
   */
  titularDeLaAutorizacion(
    ambito: AmbitoDelResidente,
    autorizacionId: string,
  ): Promise<{ readonly personaId: string; readonly nombre: string } | null>;
}

/** HU-34 · M-7. El ámbito aquí es la IDENTIDAD, no la vivienda. */
export interface NotificacionesDelResidente {
  registrarToken(
    copropiedadId: string,
    usuarioId: string,
    aparato: {
      readonly instalacionId: string;
      readonly token: string;
      readonly plataforma: 'ios' | 'android' | 'web';
    },
  ): Promise<{ readonly id: string }>;
}
