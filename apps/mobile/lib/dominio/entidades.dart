/// Entidades de la app del residente.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ EXISTEN SI YA HAY DTO GENERADOS
///
/// Porque no son lo mismo, y confundirlos es la forma más rápida de acoplar la
/// interfaz al transporte. `MiViviendaDto` es la forma del JSON de hoy: si
/// mañana el contrato renombra un campo, el generador lo renombra y **todas**
/// las pantallas que lo usaran dejarían de compilar. Con esta capa, lo que deja
/// de compilar es un fichero: el adaptador que traduce.
///
/// Es la misma frontera que en la API —el agregado nunca se serializa crudo al
/// transporte (§2.2)—, leída desde el otro lado: el transporte nunca entra
/// crudo a la presentación.
///
/// Todo es `final` y sin setters. Un objeto de esta capa no se modifica: se
/// construye otro (§2.4).
library;

class Vivienda {
  const Vivienda({
    required this.id,
    required this.identificador,
    required this.agrupacion,
    required this.etiquetaVivienda,
    required this.etiquetaAgrupacion,
    required this.direccion,
    required this.copropiedadNombre,
    required this.estadoAdministrativo,
    required this.activa,
  });

  final String id;

  /// El número, sin la palabra: `42`.
  final String identificador;
  final String? agrupacion;

  /// Cómo llama ESTA copropiedad a sus viviendas y a sus agrupaciones.
  final String etiquetaVivienda;
  final String etiquetaAgrupacion;
  final String? direccion;
  final String copropiedadNombre;
  final String estadoAdministrativo;

  /// RN-13: inactiva conserva lo vigente y no genera autorizaciones nuevas.
  final bool activa;

  /// «Casa 42 · Manzana B», compuesto con las etiquetas del conjunto.
  ///
  /// La composición vive aquí y no en cada pantalla porque aparece en cinco, y
  /// la quinta es la que se escribe distinta. No hay `switch` sobre el tipo de
  /// conjunto: las palabras llegan del servidor (migración 0029), así que un
  /// conjunto que use «Etapa» o «Sector» funciona sin tocar la app.
  String get titulo {
    final casa = '$etiquetaVivienda $identificador';
    return agrupacion == null ? casa : '$casa · $etiquetaAgrupacion $agrupacion';
  }
}

class Vinculo {
  const Vinculo({
    required this.residenteId,
    required this.esTitular,
    required this.nivelAcceso,
  });

  final String residenteId;
  final bool esTitular;
  final String? nivelAcceso;
}

class MiHogar {
  const MiHogar({
    required this.vivienda,
    required this.vinculo,
    required this.puedeAutorizar,
  });

  final Vivienda vivienda;
  final Vinculo vinculo;

  /// Lo decide el SERVIDOR (RN-13 + RN-05). La app deshabilita el botón con
  /// este booleano y no recompone la regla: dos versiones de una regla son una
  /// regla y una mentira.
  final bool puedeAutorizar;
}

class MiembroDeFamilia {
  const MiembroDeFamilia({
    required this.residenteId,
    required this.nombre,
    required this.parentesco,
    required this.esTitular,
    required this.nivelAcceso,
    required this.activo,
  });

  final String residenteId;
  final String nombre;
  final String? parentesco;
  final bool esTitular;
  final String? nivelAcceso;

  /// RN-19: el desactivado conserva historial, así que sigue apareciendo y se
  /// marca. Ocultarlo haría creer que nunca existió.
  final bool activo;
}

class Vehiculo {
  const Vehiculo({
    required this.id,
    required this.placa,
    required this.marca,
    required this.modelo,
    required this.color,
    required this.esPrincipal,
    required this.activo,
  });

  final String id;
  final String placa;
  final String? marca;
  final String? modelo;
  final String? color;
  final bool esPrincipal;
  final bool activo;

  String get descripcion => [marca, modelo, color].whereType<String>().join(' · ');
}

class Autorizacion {
  const Autorizacion({
    required this.id,
    required this.visitante,
    required this.tipo,
    required this.desde,
    required this.hasta,
    required this.placa,
    required this.permiteAccesoVehicular,
    required this.estado,
    required this.acompanantes,
  });

  final String id;
  final String visitante;
  final String tipo;
  final DateTime desde;
  final DateTime hasta;
  final String? placa;
  final bool permiteAccesoVehicular;
  final String estado;
  final int acompanantes;

  bool vigenteEn(DateTime ahora) =>
      estado == 'activa' && !ahora.isBefore(desde) && ahora.isBefore(hasta);
}

class EventoDeAcceso {
  const EventoDeAcceso({
    required this.id,
    required this.ocurridoEn,
    required this.tipo,
    required this.resultado,
    required this.motivo,
    required this.metodo,
    required this.placaDetectada,
    required this.persona,
    required this.zona,
    required this.decididoPorEdge,
  });

  final String id;
  final DateTime ocurridoEn;
  final String tipo;
  final String? resultado;

  /// El residente tiene derecho a entender la negación (mockup M-6): el motivo
  /// se muestra, no se traga.
  final String? motivo;
  final String metodo;
  final String? placaDetectada;
  final String? persona;
  final String? zona;

  /// KPI-31 · decidido con caché del Edge. Se marca en la interfaz: un evento
  /// resuelto sin nube es información del usuario, no un detalle interno.
  final bool decididoPorEdge;

  bool get negado => resultado == 'negado';
}

/// Los cuatro chips del mockup M-6.
enum PeriodoDeHistorial { hoy, semana, mes, todo }

// ═══════════════════════════════════════════════════════════════════════════
// M-4 · Crear visitante (ETAPA 11-B)
// ═══════════════════════════════════════════════════════════════════════════

/// Días de la semana del patrón de recurrencia. `0` es domingo, como en la API
/// y como en `Date.getDay()`: un enumerado propio con otro orden obligaría a
/// traducir en dos sitios y a equivocarse en uno.
enum DiaDeSemana { domingo, lunes, martes, miercoles, jueves, viernes, sabado }

extension NombreDelDia on DiaDeSemana {
  String get corto => const ['D', 'L', 'M', 'X', 'J', 'V', 'S'][index];
  String get largo => const [
        'domingo',
        'lunes',
        'martes',
        'miércoles',
        'jueves',
        'viernes',
        'sábado',
      ][index];
}

/// HU-09 · RN-22 · El patrón: qué días y entre qué horas.
class PatronDeVisita {
  const PatronDeVisita({
    required this.dias,
    required this.minutoInicio,
    required this.minutoFin,
    required this.desplazamientoUtcMinutos,
  });

  final Set<DiaDeSemana> dias;

  /// Minutos desde medianoche, en la zona del conjunto.
  final int minutoInicio;
  final int minutoFin;

  /// Bogotá es −300. Va explícito y no se deduce del teléfono: un residente de
  /// viaje no debe crear una visita con la franja de otro huso.
  final int desplazamientoUtcMinutos;

  bool get esValido => dias.isNotEmpty && minutoFin > minutoInicio;
}

/// Lo que la pantalla M-4 compone. `viviendaId` NO está, y no es un olvido: el
/// servidor la deriva de la identidad, y si estuviera aquí la app podría
/// mandarla (el segundo eje del aislamiento).
class NuevaVisita {
  const NuevaVisita({
    required this.visitante,
    required this.desde,
    required this.hasta,
    required this.claveDeIdempotencia,
    this.documento,
    this.placa,
    this.permiteAccesoVehicular = false,
    this.acompanantes = const [],
    this.zonasPermitidas = const [],
    this.observaciones,
    this.patron,
  });

  final String visitante;
  final String? documento;
  final DateTime desde;
  final DateTime hasta;
  final String? placa;
  final bool permiteAccesoVehicular;

  /// HU-08 · nombres, no un contador: sin identidad por acompañante, RN-02
  /// sería incumplible para todos menos el primero.
  final List<String> acompanantes;
  final List<String> zonasPermitidas;
  final String? observaciones;
  final PatronDeVisita? patron;

  /// RN-17 · se genera ANTES del primer intento y se repite en cada reintento.
  final String claveDeIdempotencia;
}

/// Los cuatro motivos por los que el servidor NO crea la visita.
///
/// Es un enumerado y no una cadena porque la pantalla tiene que **distinguir**:
/// «llame a la administración» y «esto no se arregla» se pintan distinto y
/// llevan a sitios distintos. Con texto habría que compararlo, y comparar
/// textos es la familia de defecto que este repositorio persigue.
enum MotivoDeRechazo { listaNegra, viviendaInactiva, sinNivelDeAcceso, placaDuplicada }

/// Lo que devuelve crear una visita. El rechazo **no es un error**: es una
/// respuesta con su motivo, y por eso viaja en el mismo tipo que el éxito.
sealed class ResultadoDeVisita {
  const ResultadoDeVisita();
}

class VisitaCreada extends ResultadoDeVisita {
  const VisitaCreada({required this.id, required this.repetida});
  final String id;

  /// `true` = era un reintento y el servidor devolvió la de antes (RN-17). La
  /// pantalla lo dice: «ya la habíamos registrado», no «creada» dos veces.
  final bool repetida;
}

class VisitaRechazada extends ResultadoDeVisita {
  const VisitaRechazada({required this.motivo, required this.explicacion});
  final MotivoDeRechazo motivo;

  /// El texto lo escribe el DOMINIO del servidor, no la pantalla: la app y la
  /// consola tienen que decir lo mismo. Si el residente lee una cosa en el
  /// teléfono y el portero otra, dejan de confiar en las dos.
  final String explicacion;
}

/// Qué puede hacer el residente ante cada rechazo. Es lo que convierte un
/// motivo en una pantalla: sin esto, los cuatro se pintarían igual.
enum SalidaDelRechazo {
  /// No tiene arreglo por parte del residente y tampoco llamando: la lista
  /// negra la levanta la administración por su propio criterio (RN-07).
  hableConLaAdministracion,

  /// Lo puede corregir él mismo, aquí y ahora.
  corrijaElFormulario,
}

extension QueHacerConElRechazo on MotivoDeRechazo {
  SalidaDelRechazo get salida => switch (this) {
        MotivoDeRechazo.listaNegra => SalidaDelRechazo.hableConLaAdministracion,
        MotivoDeRechazo.viviendaInactiva => SalidaDelRechazo.hableConLaAdministracion,
        MotivoDeRechazo.sinNivelDeAcceso => SalidaDelRechazo.hableConLaAdministracion,
        MotivoDeRechazo.placaDuplicada => SalidaDelRechazo.corrijaElFormulario,
      };

  /// Qué campo señalar cuando el residente sí puede arreglarlo.
  String? get campoAResaltar =>
      this == MotivoDeRechazo.placaDuplicada ? 'placa' : null;
}

// ═══════════════════════════════════════════════════════════════════════════
// M-5 · Zonas comunes (ETAPA 11-B)
// ═══════════════════════════════════════════════════════════════════════════

class FranjaDeZona {
  const FranjaDeZona({required this.desde, required this.hasta});
  final DateTime desde;
  final DateTime hasta;
}

/// Una zona común tal como el residente la ve.
///
/// **La interfaz REFLEJA, no calcula.** `ocupacionActual` es el número de este
/// instante y puede quedar obsoleto mientras se mira la pantalla; quien impide
/// el ingreso número 21 sobre un aforo de 20 es la base, en el momento del
/// ingreso. Por eso no hay aquí ningún método que decida si se puede entrar:
/// tenerlo invitaría a que la pantalla lo creyera.
class ZonaComun {
  const ZonaComun({
    required this.id,
    required this.nombre,
    required this.aforoMaximo,
    required this.ocupacionActual,
    required this.abiertaAhora,
    required this.franjasDeHoy,
    required this.requiereAutorizacion,
  });

  final String id;
  final String nombre;
  final int aforoMaximo;
  final int ocupacionActual;
  final bool abiertaAhora;
  final List<FranjaDeZona> franjasDeHoy;
  final bool requiereAutorizacion;

  /// Plazas libres **en el instante de la lectura**. Puede ser negativo si el
  /// aforo se configuró a la baja con gente dentro, y entonces se dice «lleno»
  /// en vez de «-3 plazas», que no significa nada para quien lo lee.
  int get plazasLibres => aforoMaximo - ocupacionActual;
  bool get lleno => plazasLibres <= 0;

  /// Sin aforo configurado, no se inventa un porcentaje: `null` y la pantalla
  /// dibuja «sin límite de aforo».
  double? get ocupacionRelativa =>
      aforoMaximo <= 0 ? null : (ocupacionActual / aforoMaximo).clamp(0.0, 1.0);
}

// ═══════════════════════════════════════════════════════════════════════════
// M-7 · Notificaciones (ETAPA 11-B)
// ═══════════════════════════════════════════════════════════════════════════

enum PlataformaDelAparato { ios, android, web }

/// El aparato que se registra para recibir avisos (HU-34).
class AparatoDeNotificaciones {
  const AparatoDeNotificaciones({
    required this.instalacionId,
    required this.token,
    required this.plataforma,
  });

  /// Identificador ESTABLE del aparato, que la app genera una vez y guarda. No
  /// es el token: el token de FCM rota solo, y si la fila del servidor se
  /// identificara por él, cada rotación dejaría un registro huérfano al que se
  /// seguiría notificando.
  final String instalacionId;
  final String token;
  final PlataformaDelAparato plataforma;
}

/// CU-02 · qué pasó con la foto del visitante.
///
/// `aceptada` con un consentimiento PENDIENTE es el único desenlace bueno, y
/// «pendiente» es literal: la plantilla no se sincroniza con ninguna terminal
/// hasta que el titular responda (RN-09). Quien responde es el VISITANTE, no el
/// residente que tomó la foto (RN-10), y por eso aquí no hay ningún método para
/// aceptar: la app del residente no puede.
sealed class ResultadoDeCaptura {
  const ResultadoDeCaptura();
}

class CapturaAceptada extends ResultadoDeCaptura {
  const CapturaAceptada({
    required this.consentimientoId,
    required this.titular,
    required this.calidad,
  });

  final String consentimientoId;

  /// A QUIÉN se le pidió. Se enseña por su nombre para que el residente
  /// entienda que la respuesta no le toca a él.
  final String titular;
  final double calidad;
}

/// El servidor volvió a juzgar la calidad y no pasó (KPI-16). Es una respuesta,
/// no un error: la app pinta los mismos consejos que pinta su propia
/// validación, porque los motivos son los mismos.
class CapturaRechazada extends ResultadoDeCaptura {
  const CapturaRechazada(this.motivos);
  final List<String> motivos;
}
