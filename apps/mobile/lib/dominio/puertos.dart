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
}

class Fallo implements Exception {
  const Fallo(this.clase, this.detalle);
  final ClaseDeFallo clase;
  final String detalle;

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
  Future<Sesion> iniciarSesion({required String correo, required String clave});

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
