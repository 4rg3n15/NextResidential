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

import 'dart:convert';
import 'dart:typed_data';

import 'calidad_de_captura.dart';

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
  const Vinculo({required this.residenteId, required this.esTitular, required this.nivelAcceso});

  final String residenteId;
  final bool esTitular;
  final String? nivelAcceso;
}

class MiHogar {
  const MiHogar({required this.vivienda, required this.vinculo, required this.puedeAutorizar});

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
// M-4 · Nuevo visitante con foto y casilla (15-L, bloque F)
// ═══════════════════════════════════════════════════════════════════════════

/// F4 · el texto EXACTO de la casilla del formulario.
///
/// Es el mismo que el servidor guarda como la versión que se marcó: si la app
/// dijera otra cosa, la constancia describiría un texto que el residente nunca
/// leyó. Por eso vive aquí, con nombre, y la pantalla no lo reescribe.
const textoDeLaCasilla = 'El visitante autorizó el uso de su foto para el ingreso';

/// La foto frontal del visitante, lista para viajar: un JPEG en base64 y las
/// medidas con las que se juzgó.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ LAS MEDIDAS VIAJAN CON LA FOTO
///
/// Porque el servidor vuelve a juzgar la calidad con ellas (una validación que
/// sólo ocurre en el teléfono se salta con un cliente modificado), y porque la
/// bandeja de salida guarda las dos cosas juntas: una foto sin sus medidas no
/// se podría reenviar tras un corte de red.
///
/// Las medidas son las EFECTIVAS: si la cámara no trae detector de rostros y el
/// residente confirmó el encuadre, llevan el rostro y la proporción que esa
/// confirmación declara, no los ceros de la foto cruda.
///
/// La foto vive en memoria mientras el formulario está abierto o mientras la
/// visita espera en la bandeja; en el teléfono no queda nada.
class FotoDeVisita {
  const FotoDeVisita({required this.jpegBase64, required this.medidas});

  /// Desde los bytes que entregó la cámara. La conversión vive aquí y no en la
  /// pantalla para que la pantalla no tenga que saber cómo viaja una imagen.
  factory FotoDeVisita.deJpeg(Uint8List jpeg, MedidasDeCaptura medidas) =>
      FotoDeVisita(jpegBase64: base64Encode(jpeg), medidas: medidas);

  final String jpegBase64;
  final MedidasDeCaptura medidas;
}

/// F1 · lo que el formulario del residente compone. `viviendaId` NO está, y no
/// es un olvido: el servidor la deriva de la identidad, y si estuviera aquí la
/// app podría mandarla (el segundo eje del aislamiento).
///
/// Tampoco hay recurrencia, acompañantes ni zonas: esta ruta no los recibe. Una
/// visita es UNA persona con su documento, UN inicio y UNA duración, con su
/// foto frontal y la casilla. Nace autorizada y la foto sale a los equipos.
class NuevaVisita {
  const NuevaVisita({
    required this.visitante,
    required this.documento,
    required this.inicio,
    required this.duracionMinutos,
    required this.foto,
    required this.casillaMarcada,
    required this.claveDeIdempotencia,
    this.placa,
    this.observaciones,
  });

  final String visitante;

  /// Obligatorio: sin documento la lista negra sólo se podría cruzar por
  /// placa, y un visitante a pie quedaría sin comprobar.
  final String documento;

  /// Fecha y hora de la visita. Viaja en UTC; la pantalla la muestra en la
  /// hora del teléfono.
  final DateTime inicio;

  /// Cuánto dura. El servidor admite de 15 minutos a 24 horas.
  final int duracionMinutos;

  final String? placa;
  final String? observaciones;
  final FotoDeVisita foto;

  /// F4 · la casilla. La marca el residente, y el servidor registra quién la
  /// marcó, cuándo y con qué texto. Sin ella no se crea nada.
  final bool casillaMarcada;

  /// RN-17 · se genera al ABRIR el formulario y se repite en cada reintento.
  final String claveDeIdempotencia;

  /// Cuándo termina. No viaja: el servidor lo calcula con la misma suma, y se
  /// ofrece aquí para que la pantalla diga «hasta las 18:00» sin rehacerla.
  DateTime get hasta => inicio.add(Duration(minutes: duracionMinutos));
}

/// F6 · un visitante que ya vino, uno por persona y el más reciente primero.
///
/// Es lo que hace útil «Volver a autorizar»: quien viene cada semana no debería
/// dictar otra vez su nombre y su documento ni posar para otra foto.
class VisitanteReciente {
  const VisitanteReciente({
    required this.autorizacionId,
    required this.visitante,
    required this.documento,
    required this.ultimaVisita,
    required this.placa,
    required this.tieneFoto,
  });

  /// La autorización de su ÚLTIMA visita. De ella copia el servidor el nombre,
  /// el documento, la placa y la foto; la app no reenvía ninguno de los cuatro.
  final String autorizacionId;
  final String visitante;
  final String documento;
  final DateTime ultimaVisita;
  final String? placa;

  /// Sin foto guardada no hay nada que copiar: el servidor contestaría que se
  /// registre como visitante nuevo, y la pantalla lo dice antes de intentarlo.
  final bool tieneFoto;
}

/// Los cuatro motivos por los que el servidor NO crea la visita.
///
/// Es un enumerado y no una cadena porque la pantalla tiene que **distinguir**:
/// «llame a la administración» y «esto no se arregla» se pintan distinto y
/// llevan a sitios distintos. Con texto habría que compararlo, y comparar
/// textos es la familia de defecto que este repositorio persigue.
enum MotivoDeRechazo { listaNegra, viviendaInactiva, sinNivelDeAcceso, placaDuplicada }

/// Lo que devuelve crear una visita (o volver a autorizarla). El rechazo **no
/// es un error**: es una respuesta con su motivo, y por eso viaja en el mismo
/// tipo que el éxito.
sealed class ResultadoDeVisita {
  const ResultadoDeVisita();
}

class VisitaCreada extends ResultadoDeVisita {
  const VisitaCreada({
    required this.id,
    required this.repetida,
    this.equipos = 0,
    this.sincronizadas = 0,
    this.fallidas = 0,
    this.avisoDeSincronizacion,
  });
  final String id;

  /// `true` = era un reintento y el servidor devolvió la de antes (RN-17). La
  /// pantalla lo dice: «ya la habíamos registrado», no «creada» dos veces.
  final bool repetida;

  /// F3 · a cuántos equipos con reconocimiento facial se envió la foto, en
  /// cuántos quedó y en cuántos no. Es lo que permite decir «la foto quedó en
  /// 2 de 3 equipos» en vez de un «listo» que no promete nada comprobable.
  final int equipos;
  final int sincronizadas;
  final int fallidas;

  /// Por qué no se pudo sincronizar, si fue así. Lo escribe el servidor.
  final String? avisoDeSincronizacion;
}

/// El servidor contestó y NO creó la visita.
///
/// Las dos formas comparten esta raíz porque comparten la regla que importa: no
/// son fallos de transporte y **reintentarlas daría la misma respuesta**, así
/// que la bandeja de salida nunca las reintenta.
sealed class VisitaNoCreada extends ResultadoDeVisita {
  const VisitaNoCreada();
}

class VisitaRechazada extends VisitaNoCreada {
  const VisitaRechazada({required this.motivo, required this.explicacion});
  final MotivoDeRechazo motivo;

  /// El texto lo escribe el DOMINIO del servidor, no la pantalla: la app y la
  /// consola tienen que decir lo mismo. Si el residente lee una cosa en el
  /// teléfono y el portero otra, dejan de confiar en las dos.
  final String explicacion;
}

/// El servidor volvió a juzgar la foto y no le sirvió (la calidad se juzga
/// aquí antes de enviar, y allí otra vez). Es una respuesta, no un error: el
/// residente repite la foto y vuelve a registrar.
class FotoRechazada extends VisitaNoCreada {
  const FotoRechazada(this.motivos);

  /// Los códigos TAL COMO LLEGAN. No se enseñan nunca: se enseña [razones].
  final List<String> motivos;

  /// Lo que se le dice al residente, sin códigos y sin repetir.
  List<String> get razones => motivos.map(razonDeLaFoto).toSet().toList();
}

/// Traduce un código de rechazo de la foto a palabras.
///
/// Un código que el servidor añada mañana no se enseña crudo: cae en una frase
/// genérica que sigue siendo verdad. Enseñar «ENCUADRE_OBLICUO» a un residente
/// no le dice qué hacer con el teléfono.
String razonDeLaFoto(String codigo) => switch (codigo) {
  'ROSTROS_MULTIPLES' => 'se ve más de un rostro',
  'SIN_ROSTRO' => 'no se ve ningún rostro',
  'NITIDEZ' => 'la foto está borrosa',
  'ILUMINACION' => 'la luz no es suficiente o sobra',
  'ENCUADRE' => 'el rostro no está bien encuadrado',
  _ => 'la foto no tiene la calidad que piden los equipos',
};

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
  String? get campoAResaltar => this == MotivoDeRechazo.placaDuplicada ? 'placa' : null;
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
