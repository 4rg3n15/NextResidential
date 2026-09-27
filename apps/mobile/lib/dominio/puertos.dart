/// Puertos y fallos tipados del dominio de la app.
///
/// La dirección de dependencia es la misma que en la API: el dominio declara,
/// la infraestructura cumple (§2.2, DIP). Nada de este fichero sabe qué es Dio,
/// `flutter_secure_storage` ni un `DioException`.
///
/// **Fallos tipados, no excepciones sueltas.** §2.4 lo prohíbe en TypeScript y
/// aquí vale igual: si el repositorio lanzara `DioException`, la pantalla
/// tendría que preguntarle al error si fue 401, 403 o un socket cerrado, y eso
/// es acoplar la interfaz al transporte. Cada fallo de aquí se corresponde con
/// **un estado que el mockup no dibuja** (`03-mockups.md` §4), que es
/// exactamente lo que hay que construir.
library;

import 'dart:typed_data';

import 'acceso.dart';
import 'calidad_de_captura.dart';
import 'entidades.dart';
import 'sesion.dart';

enum ClaseDeFallo {
  /// 401 · el token no vale. La app lleva a la pantalla de acceso.
  sesionInvalida,

  /// 403 · la identidad no alcanza el recurso. No es lo mismo que 401 y se
  /// pinta distinto: reintentar no lo arregla.
  sinPermiso,

  /// 404 sobre la propia vivienda: el residente no tiene una asignada. Es un
  /// estado PREVISTO del mockup M-1, no un error.
  sinVivienda,

  /// No hubo red. Distinto de un 500: lo que había en caché sigue sirviendo.
  sinConexion,

  /// El servidor contestó mal. Se muestra la causa y se ofrece reintentar.
  servidor,

  /// 400 · 422 · el servidor rechazó la FORMA de lo enviado: falta la casilla,
  /// la duración se sale de lo admitido, la foto no es la imagen que dice ser,
  /// la visita a repetir no tiene foto. Distinto de `servidor` porque aquí
  /// **reintentar lo mismo da lo mismo**: la bandeja de salida no lo reintenta
  /// y la pantalla enseña el motivo para que se corrija.
  datosNoValidos,
}

class Fallo implements Exception {
  const Fallo(this.clase, this.detalle, {this.detalleTecnico});
  final ClaseDeFallo clase;
  final String detalle;

  /// H-SITIO-11 · el POR QUÉ técnico de un fallo de red: la URL base con la
  /// que se compiló la app, el tipo de excepción del transporte y su mensaje.
  /// En sitio, un iPhone decía «No hay conexión con el servidor» mientras
  /// Safari abría la API, y sin esto no había forma de saber si era la URL,
  /// el permiso de red local o el servidor. Nunca lleva tokens (lo sanea la
  /// infraestructura) y la interfaz lo pinta SÓLO en compilación Debug.
  final String? detalleTecnico;

  @override
  String toString() => 'Fallo(${clase.name}: $detalle)';
}

/// Lecturas de la app. Una por pantalla, y ninguna recibe la vivienda: el
/// servidor la deriva de la identidad (el segundo eje del aislamiento).
abstract interface class RepositorioDelResidente {
  Future<MiHogar> miHogar();
  Future<List<MiembroDeFamilia>> miFamilia();
  Future<List<Vehiculo>> misVehiculos();
  Future<List<Autorizacion>> misAutorizaciones();
  Future<List<EventoDeAcceso>> miHistorial(PeriodoDeHistorial periodo);

  /// M-5 · las zonas del conjunto con su aforo y su horario de AHORA.
  Future<List<ZonaComun>> misZonas();

  /// F1 · crea la visita con su foto y la casilla. **No lanza ante un rechazo
  /// de negocio ni ante una foto que no sirve**: devuelve `VisitaRechazada` o
  /// `FotoRechazada`. Lanzar habría obligado a la pantalla a interrogar al
  /// error para distinguir los motivos, que es justo lo que el tipo evita.
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita);

  /// F6 · los últimos visitantes de MI vivienda, uno por persona.
  Future<List<VisitanteReciente>> ultimosVisitantes();

  /// F6 · vuelve a autorizar a un visitante que ya vino.
  ///
  /// **Sólo viaja lo que cambia**: cuándo, cuánto y la casilla. El nombre, el
  /// documento, la placa y la foto los copia el servidor de `autorizacionId`,
  /// y sólo si esa visita es de la vivienda de quien lo pide. La casilla se
  /// vuelve a marcar porque cada autorización lleva su propia constancia.
  Future<ResultadoDeVisita> volverAAutorizar({
    required String autorizacionId,
    required DateTime inicio,
    required int duracionMinutos,
    required bool casillaMarcada,
    required String claveDeIdempotencia,
  });

  /// M-7 · HU-34 · registra este aparato para recibir avisos.
  Future<void> registrarAparato(AparatoDeNotificaciones aparato);
}

/// De dónde sale la foto del visitante. Es un puerto por lo de siempre: sin él
/// el formulario no se podría probar sin una cámara, y con él se prueban las
/// siete formas de salir mal sin sacar una sola foto.
typedef TomarFoto = Future<FotoTomada?> Function();

/// Lo que entrega la cámara: el JPEG ya reducido y lo que se midió de él.
class FotoTomada {
  const FotoTomada({
    required this.jpeg,
    required this.medidas,
    this.vistaPrevia,
    this.sinDetector = false,
  });

  /// La foto que viaja, ya reducida en el aparato. Vive en memoria mientras el
  /// formulario está abierto; en el teléfono no se guarda.
  final Uint8List jpeg;
  final MedidasDeCaptura medidas;

  /// Miniatura para que el residente vea qué salió. `null` si la fuente no
  /// produce una imagen que merezca enseñarse (la cámara simulada).
  final Uint8List? vistaPrevia;

  /// La cámara del sistema no trae detector de rostros: el conteo y la
  /// proporción los sustituye la confirmación del encuadre por quien captura,
  /// igual que en la consola. Nunca se inventan.
  final bool sinDetector;
}

/// De dónde sale el identificador estable del aparato y su token de FCM.
///
/// Es un puerto y no una llamada directa a Firebase por lo de siempre: el
/// dominio no sabe qué es FCM, y sin esta frontera no habría forma de probar el
/// registro sin un teléfono con Google Play. El adaptador real llega con la
/// integración de Firebase; el simulado permite ejercer el flujo entero.
abstract interface class FuenteDeNotificaciones {
  /// Pide permiso al sistema. `false` = el residente lo negó, y eso **no es un
  /// error**: es un estado que la pantalla tiene que saber pintar.
  Future<bool> pedirPermiso();

  /// `null` si no hay permiso o el servicio no está disponible.
  Future<AparatoDeNotificaciones?> aparato();
}

/// Dónde vive la sesión. El adaptador usa Keychain en iOS y Keystore en
/// Android; el dominio solo sabe que se guarda, se lee y se borra.
abstract interface class AlmacenDeSesion {
  Future<Sesion?> leer();
  Future<void> guardar(Sesion sesion, {required DateTime ultimoUso});
  Future<DateTime?> ultimoUso();
  Future<void> borrar();
}

/// Quién emite y renueva la sesión.
abstract interface class Autenticador {
  /// D1 · por código y usuario, o por correo (cuentas anteriores a la 15-H).
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso identificador, {required String clave});

  /// Renueva con el token de refresco. Un fallo aquí es `sesionInvalida`: el
  /// residente tiene que volver a entrar, y la app lo dice sin rodeos.
  Future<Sesion> renovar(Sesion sesion);
}

/// Reloj inyectable. Existe por lo mismo que en la API: una política de
/// caducidad que lee el reloj por su cuenta no se puede probar sin esperar.
abstract interface class Reloj {
  DateTime ahora();
}

class RelojDelSistema implements Reloj {
  const RelojDelSistema();
  @override
  DateTime ahora() => DateTime.now();
}
