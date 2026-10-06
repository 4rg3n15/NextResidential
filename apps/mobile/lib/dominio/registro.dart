/// «Crear cuenta» con un código de invitación (RONDA 15-W).
///
/// ═════════════════════════════════════════════════════════════════════════════
/// QUIÉN CREA SU CUENTA, Y CON QUÉ
///
/// Una persona mayor de edad crea SU cuenta con el código de una plaza libre
/// que el titular de su vivienda le compartió («MIRA-K7PQ-2XWZ»). El código ya
/// dice el conjunto y la vivienda: la app no pide ninguno de los dos. El
/// servidor no emite sesión al crearla; la app entra después por el acceso de
/// siempre, con el PREFIJO del código como código de la copropiedad.
///
/// La política de tratamiento de datos (Ley 1581 de 2012) la entrega el
/// servidor con su versión, la app la muestra tal cual y devuelve la versión
/// que mostró: si cambió entre tanto, el servidor no sigue y manda la nueva.
///
/// Un código incorrecto, usado o de otro conjunto recibe UNA sola respuesta
/// genérica del servidor, y la app la pinta tal cual: ninguna regla de aquí
/// dice nada de la validez de un código, sólo de su forma.
/// ═════════════════════════════════════════════════════════════════════════════
library;

class PoliticaDeDatos {
  const PoliticaDeDatos({required this.version, required this.texto});
  final String version;
  final String texto;
}

class SolicitudDeRegistro {
  const SolicitudDeRegistro({
    required this.usuario,
    required this.correo,
    required this.contrasena,
    required this.confirmacion,
    required this.codigoDeInvitacion,
    required this.fechaNacimiento,
    required this.versionPolitica,
  });

  final String usuario;

  /// Contacto, no acceso: no sirve para entrar ni para recuperar la clave.
  final String correo;
  final String contrasena;
  final String confirmacion;
  final String codigoDeInvitacion;

  /// `AAAA-MM-DD`.
  final String fechaNacimiento;

  /// La versión de la política que se MOSTRÓ y se aceptó.
  final String versionPolitica;
}

sealed class ResultadoDeRegistro {
  const ResultadoDeRegistro();
}

/// Creada. Todavía sin sesión: se entra con el acceso de siempre.
final class CuentaCreada extends ResultadoDeRegistro {
  const CuentaCreada();
}

/// El servidor rechazó campos concretos, por nombre.
final class RegistroConErrores extends ResultadoDeRegistro {
  const RegistroConErrores(this.campos, {this.politica});
  final Map<String, String> campos;

  /// La vigente: si no es la que se mostró, hay que leerla y aceptarla otra vez.
  final PoliticaDeDatos? politica;
}

/// No se creó, por un motivo que no es de un campo: la edad, el código, el
/// usuario ocupado o demasiados intentos. El texto es el del servidor.
final class RegistroRechazado extends ResultadoDeRegistro {
  const RegistroRechazado(this.mensaje, {this.politica});
  final String mensaje;
  final PoliticaDeDatos? politica;
}

abstract interface class ServicioDeRegistro {
  /// La política vigente, para mostrarla ANTES de aceptarla.
  Future<PoliticaDeDatos> politicaVigente();
  Future<ResultadoDeRegistro> registrar(SolicitudDeRegistro solicitud);
}

const _longitudDelCodigo = 8;

/// El código corto de la copropiedad, que es el prefijo del código de
/// invitación: lo que va delante de sus ocho últimos símbolos, con o sin
/// guiones y espacios. `null` si no hay uno con forma de código de conjunto.
String? copropiedadDelCodigo(String codigoDeInvitacion) {
  final limpio = codigoDeInvitacion.replaceAll(RegExp(r'[\s-]'), '').toUpperCase();
  if (limpio.length <= _longitudDelCodigo) return null;
  final prefijo = limpio.substring(0, limpio.length - _longitudDelCodigo);
  return RegExp(r'^[A-Z0-9]{3,8}$').hasMatch(prefijo) ? prefijo : null;
}

/// Cortesía del campo del código: sólo su FORMA. Sin prefijo no habría con qué
/// entrar después, y el servidor tampoco lo aceptaría.
String? motivoDeCodigoDeInvitacion(String bruto) {
  if (bruto.trim().isEmpty) return 'Escriba el código de invitación';
  if (copropiedadDelCodigo(bruto) == null) {
    return 'Escriba el código completo, como MIRA-K7PQ-2XWZ';
  }
  return null;
}

/// El usuario como lo normaliza el servidor: recortado y en minúsculas.
String normalizarUsuario(String bruto) => bruto.trim().toLowerCase();

/// Cortesía del usuario, con los mismos textos que el servidor.
String? motivoDeUsuarioInvalido(String bruto) {
  final u = normalizarUsuario(bruto);
  if (u.length < 3 || u.length > 32) return 'El usuario tiene entre 3 y 32 caracteres';
  if (!RegExp(r'^[a-z0-9][a-z0-9._-]{2,31}$').hasMatch(u)) {
    return 'El usuario admite letras sin tilde, números, punto, guion y guion bajo, '
        'y empieza por letra o número';
  }
  return null;
}

/// Cortesía del correo de contacto: que tenga forma de correo.
String? motivoDeCorreoInvalido(String bruto) {
  final c = bruto.trim();
  if (c.isEmpty) return 'Escriba su correo';
  return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(c) ? null : 'Escriba un correo válido';
}

/// Cuándo se puede pulsar «Crear cuenta»: todo escrito, las dos contraseñas
/// iguales, la política recibida y la casilla marcada.
bool registroListoParaEnviar({
  required String usuario,
  required String correo,
  required String contrasena,
  required String confirmacion,
  required String codigo,
  required String fechaNacimiento,
  required bool aceptada,
  required bool hayPolitica,
}) {
  final escritos = [usuario, correo, codigo, fechaNacimiento].every((v) => v.trim().isNotEmpty);
  return escritos && contrasena.isNotEmpty && contrasena == confirmacion && aceptada && hayPolitica;
}
