/**
 * Contratos compartidos — **paquete de solo tipos**.
 *
 * `openapi.json` lo genera `pnpm contrato` desde los controladores de NestJS;
 * `src/generado/api.ts` lo genera `pnpm contrato:cliente` desde ese JSON. Nada
 * de esto se escribe a mano (§2.6), y el control `contrato:desfasado` rompe el
 * build si el fichero generado no coincide con el contrato.
 *
 * **Por qué aquí no hay cliente HTTP.** `openapi-fetch` vive en `apps/web`, no
 * en este paquete. Dos razones: así `@ncr/contracts` no arrastra ninguna
 * dependencia de ejecución —lo consumen la consola, y mañana el generador de
 * Dart, que no comparte runtime—, y así el empaquetador de Next.js resuelve el
 * módulo ESM sin que este paquete tenga que decidir entre CJS y ESM por él.
 */
export type { components, operations, paths } from './generado/api';

import type { components } from './generado/api';

/**
 * Alias del vocabulario que la consola usa a diario. No son tipos nuevos: son
 * atajos sobre lo generado, para que una vista escriba `Indicadores` en vez de
 * `components['schemas']['IndicadoresDto']` y para que el día que el DTO cambie
 * de nombre haya un solo sitio que tocar.
 */
export type Esquemas = components['schemas'];

export type Sesion = Esquemas['SesionDto'];
export type Indicadores = Esquemas['IndicadoresDto'];
export type AccesosPorHora = Esquemas['AccesosPorHoraDto'];
export type FranjaDeAccesos = Esquemas['FranjaDeAccesosDto'];
export type EstadoDeDispositivos = Esquemas['EstadoDeDispositivosDto'];
export type DispositivoDelTablero = Esquemas['DispositivoDelTableroDto'];
export type EventoRegistrado = Esquemas['EventoRegistradoDto'];
export type PaginaDeEventos = Esquemas['PaginaDeEventosDto'];
export type AlertaExpuesta = Esquemas['AlertaExpuestaDto'];
export type ErrorApi = Esquemas['ErrorApiDto'];
/** ETAPA 14 · tablero de las cinco latencias comprometidas (RNF-11.3). */
export type Latencias = Esquemas['LatenciasDto'];
export type FilaDeLatencia = Esquemas['FilaDeLatenciaDto'];
export type DefinicionDeKpi = Esquemas['DefinicionKpiDto'];
export type Copropiedad = Esquemas['CopropiedadDto'];
/** Catálogo del alcance del token (ETAPA 09-B, `GET /copropiedades`). */
export type AlcanceDeCopropiedades = Esquemas['AlcanceDeCopropiedadesDto'];
export type CopropiedadResumen = Esquemas['CopropiedadResumenDto'];
export type ConfiguracionDeCopropiedad = Esquemas['ConfiguracionDeCopropiedadDto'];

/* ── ETAPA 10 · consolas operativas ─────────────────────────────────────── */
export type OrdenManual = Esquemas['OrdenManualDto'];
export type OrdenEjecutada = Esquemas['OrdenEjecutadaDto'];
export type ColaDeAtencion = Esquemas['ColaDeAtencionDto'];
export type EnAtencion = Esquemas['EnAtencionDto'];
export type EstadoDeCanal = Esquemas['EstadoDeCanalDto'];
export type CambiosDeConfiguracion = Esquemas['CambiosDeConfiguracionDto'];
export type ConfiguracionRechazada = Esquemas['ConfiguracionRechazadaDto'];
/** Las claves que ESTE rol puede cambiar. La API las declara; la consola obedece. */
export type ClaveDeAjuste = keyof CambiosDeConfiguracion;

/* ETAPA 09-B · las siete pantallas restantes. Los alias existen para que la
 * consola no escriba `components['schemas']['…Dto']` en cada import: el tipo
 * sigue viniendo del contrato generado, así que un campo que la API deje de
 * devolver rompe la compilación igual. */
export type PaginaDeViviendas = Esquemas['PaginaDeViviendasDto'];
export type Vivienda = Esquemas['ViviendaDto'];
export type Vehiculo = Esquemas['VehiculoDto'];
export type Autorizacion = Esquemas['AutorizacionDto'];

/* D-72 · identidad de persona resuelta por nombre o documento, nunca por UUID. */
export type Persona = Esquemas['PersonaDto'];
export type PersonaResuelta = Esquemas['PersonaResueltaDto'];
export type TipoDeDocumento = Persona['tipoDocumento'];
export type PatronDeAutorizacion = Esquemas['PatronDeAutorizacionDto'];
export type Zona = Esquemas['ZonaDto'];
export type FranjaDeZona = Esquemas['FranjaDto'];
export type Pendientes = Esquemas['PendientesDto'];
export type ResultadoDeOperacion = Esquemas['ResultadoDeOperacionDto'];
export type Informe = Esquemas['InformeDto'];
export type FilaDeInforme = Esquemas['FilaDeInformeDto'];
export type PuntoDeFrecuencia = Esquemas['PuntoDeFrecuenciaDto'];
/** Los cuatro tipos del mockup, tomados del contrato y no reescritos a mano. */
export type TipoDeInforme = Informe['tipo'];
export type EstadoDeRegistro = Vivienda['estado'];
export type ResultadoDeCarga = Esquemas['ResultadoDeCargaDto'];

/* Alta de viviendas por generación. El plan y su vista previa salen del
 * contrato, no de una copia en la consola: el día que el dominio añada un campo
 * al plan, el asistente deja de compilar hasta que alguien lo pinte. */
export type PlanDeGeneracion = Esquemas['PlanDeGeneracionDto'];
/** ETAPA 15-D (O3) · lo que devuelve la generación con modos, y la fotografía del visitante. */
export type GeneracionAplicada = Esquemas['GeneracionAplicadaDto'];
export type ModoDeRegeneracion = NonNullable<Esquemas['ConfirmarGeneracionDto']['modo']>;
export type UrlDeFotografia = Esquemas['UrlDeFotografiaDto'];
export type EstadoAdministrativo = NonNullable<
  Esquemas['EditarViviendaDto']['estadoAdministrativo']
>;
export type ExcepcionDeAgrupacion = Esquemas['ExcepcionDeAgrupacionDto'];
export type VistaPreviaDeGeneracion = Esquemas['VistaPreviaDeGeneracionDto'];
export type GrupoProyectado = Esquemas['GrupoProyectadoDto'];
export type ViviendaProyectada = Esquemas['ViviendaProyectadaDto'];

/* ETAPA 15-B · aprovisionamiento de equipos (A). `EquipoDto` **no declara
 * `secreto`**: el tipo que la consola ve no tiene dónde ponerlo, así que ni
 * siquiera existe el descuido posible de pintarlo. */
export type Equipo = Esquemas['EquipoDto'];
export type Equipos = Esquemas['EquiposDto'];
export type AltaDeEquipo = Esquemas['AltaDeEquipoDto'];
export type ResultadoDeSondeo = Esquemas['ResultadoDeSondeoDto'];
/**
 * Lo que la consola pinta de un equipo: qué se leyó, qué debería decir, y si
 * hay un botón que lo arregle. Todos los hallazgos con **el mismo tipo**, para
 * que la pantalla pinte una lista y no seis bloques que se parecen.
 */
export type FichaDelEquipo = Esquemas['FichaDelEquipoDto'];
export type HallazgoDelEquipo = Esquemas['HallazgoDelEquipoDto'];
export type ResultadoDeCorreccion = Esquemas['ResultadoDeCorreccionDto'];
export type TipoDeEquipo = Equipo['tipo'];
/** Los cuatro tipos de conjunto, tomados del contrato. */
export type TipoDeCopropiedad = NonNullable<ConfiguracionDeCopropiedad['tipo']>;

/**
 * Motivo de denegación, tomado del contrato y no de una lista paralela.
 *
 * Es el tipo que permite a la consola discriminar sin comparar cadenas: si el
 * dominio añade un motivo —como pasó con `FUERA_DE_HORARIO`—, el `switch`
 * exhaustivo de la interfaz deja de compilar hasta que alguien le dé texto.
 */
export type MotivoAcceso = NonNullable<EventoRegistrado['motivo']>;

/** Estado de un dispositivo derivado del latido (RN-12, CA-26). */
export type EstadoDeDispositivo = DispositivoDelTablero['estado'];

/** Roles del sistema, tal como los declara el contrato. */
export type Rol = Sesion['rol'];

/** ETAPA 15-H (ADR-023/024) · portería: sesión, patrullaje, porteros, turnos y bitácora. */
export type EstadoDeSesionDePorteria = Esquemas['EstadoDeSesionDto'];
export type ResultadoDeDesbloqueo = Esquemas['ResultadoDeDesbloqueoDto'];
export type Portero = Esquemas['PorteroDto'];
export type Porteros = Esquemas['PorterosDto'];
export type TurnoDePorteria = Esquemas['TurnoDto'];
export type TurnoGuardado = Esquemas['TurnoGuardadoDto'];
export type HechoDeBitacora = Esquemas['HechoDeBitacoraDto'];
export type TipoDeHechoDeBitacora = HechoDeBitacora['tipo'];
