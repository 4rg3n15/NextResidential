/// Cómo entra el residente, y qué le falta para operar (ETAPA 15-I, D1, 3.2).
///
/// ═════════════════════════════════════════════════════════════════════════════
/// CÓDIGO + USUARIO + CONTRASEÑA (D1)
///
/// El residente entra con el CÓDIGO corto de su copropiedad («MIRA»), su
/// usuario y su contraseña. El usuario NO es un correo: lo creó el
/// superadministrador. Las cuentas anteriores a la 15-H siguen entrando con su
/// correo, y la regla que distingue las dos es la de la consola: con arroba es
/// un correo; sin ella, un usuario, y entonces el código es obligatorio.
///
/// El servidor traduce código y usuario al correo sintético con el que el
/// proveedor de identidad autentica; ese correo no llega nunca a la app.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// EL PRIMER INGRESO, COMO UNA FUNCIÓN PURA
///
/// Hasta completarlo no se ve ninguna otra pantalla (3.2). Qué pantalla toca es
/// una decisión de tres hechos —el cambio de contraseña pendiente que viaja en
/// el token, si hay vivienda vinculada, y si el primer residente aún no declaró
/// sus ocupantes—, y se decide aquí para poder probar los cuatro casos sin
/// montar la app.
library;

sealed class IdentificadorDeAcceso {
  const IdentificadorDeAcceso();
}

/// Cuentas anteriores a la 15-H: entran con su correo real.
final class PorCorreo extends IdentificadorDeAcceso {
  const PorCorreo(this.correo);
  final String correo;
}

/// D1 · código corto de la copropiedad y nombre de usuario.
final class PorUsuario extends IdentificadorDeAcceso {
  const PorUsuario({required this.codigo, required this.usuario});
  final String codigo;
  final String usuario;
}

/// Lo que el residente escribe en el código: sin espacios y en mayúsculas.
String normalizarCodigo(String bruto) => bruto.replaceAll(RegExp(r'\s'), '').toUpperCase();

/// `null` si vale; si no, el texto que el formulario enseña.
String? motivoDeCodigoInvalido(String bruto) {
  final c = normalizarCodigo(bruto);
  if (c.isEmpty) return 'Escriba el código de su copropiedad';
  if (!RegExp(r'^[A-Z0-9]{3,8}$').hasMatch(c)) {
    return 'El código tiene de 3 a 8 letras o números';
  }
  return null;
}

/// Con arroba es un correo; sin ella, un usuario con su código (D1).
IdentificadorDeAcceso identificadorDesde({required String codigo, required String usuario}) {
  final u = usuario.trim();
  if (u.contains('@')) return PorCorreo(u.toLowerCase());
  return PorUsuario(codigo: normalizarCodigo(codigo), usuario: u.toLowerCase());
}

/// ¿Hace falta el código para este usuario? Sólo si no es un correo.
bool pideCodigo(String usuario) => !usuario.contains('@');

/// La pantalla que toca en el primer ingreso.
enum PasoDePrimerIngreso {
  /// ADR-023 · la contraseña inicial o restablecida se cambia antes que nada.
  cambiarContrasena,

  /// Se sabe que la contraseña está al día y falta preguntar a la API.
  consultarAlta,

  /// 3.2 · contacto, documento, vivienda y código de vinculación.
  completarAlta,

  /// D6 · el primer residente declara cuántos ocupantes hay.
  declararOcupantes,

  /// Todo listo: la app normal.
  listo,
}

PasoDePrimerIngreso pasoDePrimerIngreso({
  required bool debeCambiarContrasena,
  required bool? viviendaVinculada,
  required bool debeDeclararOcupantes,
}) {
  if (debeCambiarContrasena) return PasoDePrimerIngreso.cambiarContrasena;
  if (viviendaVinculada == null) return PasoDePrimerIngreso.consultarAlta;
  if (!viviendaVinculada) return PasoDePrimerIngreso.completarAlta;
  if (debeDeclararOcupantes) return PasoDePrimerIngreso.declararOcupantes;
  return PasoDePrimerIngreso.listo;
}

/// La política de contraseña, COPIA DE CORTESÍA de la del servidor
/// (`apps/api/src/cuentas/dominio/politica-de-contrasena.ts`). Decide el
/// servidor (§2.7.3); esto sólo evita un viaje para decir lo evidente, y la
/// prueba de paridad de la app usa los mismos ejemplos que la de la consola.
String? motivoDeRechazoDeContrasena(String c) {
  if (c.length > 256) return 'La contraseña no puede superar los 256 caracteres';
  final faltan = <String>[
    if (c.length < 8) 'al menos 8 caracteres',
    if (!RegExp(r'\p{Lu}', unicode: true).hasMatch(c)) 'una letra mayúscula',
    if (!RegExp(r'\p{Ll}', unicode: true).hasMatch(c)) 'una letra minúscula',
    if (!RegExp(r'\p{Nd}', unicode: true).hasMatch(c)) 'un número',
    if (!RegExp(r'[^\p{L}\p{Nd}\s]', unicode: true).hasMatch(c)) 'un carácter especial',
  ];
  return faltan.isEmpty ? null : 'A la contraseña le falta: ${faltan.join(', ')}';
}

/// El dominio del correo SINTÉTICO de las cuentas por usuario (ADR-023).
///
/// `[CONTRADICCIÓN]` C-36 · el correo sintético «no sale de la API», pero el
/// proveedor de identidad lo pone en el claim `email` del JWT, que es un claim
/// OBLIGATORIO del token. Lo que sí se garantiza es que la app no lo enseña
/// ni lo reenvía: la sesión lo descarta al leer los claims.
const dominioSintetico = '.usuarios.ncr.invalid';

bool esCorreoSintetico(String correo) => correo.toLowerCase().endsWith(dominioSintetico);
