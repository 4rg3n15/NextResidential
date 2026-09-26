/// De dos tokens a una `Sesion`: lo comparten el acceso por la API y la
/// renovación contra Supabase, que devuelven los mismos tokens del proveedor.
///
/// LOS CLAIMS SE LEEN, NO SE CREEN. La carga útil del JWT se descodifica **sin
/// verificar la firma**, y eso está bien siempre que se entienda para qué: la
/// app necesita saber a qué copropiedad apuntar la ruta, qué usuario es y si
/// tiene el cambio de contraseña pendiente, que son datos de NAVEGACIÓN. La
/// autorización la decide el servidor, que sí verifica la firma contra el JWKS
/// (ETAPA 03). Un residente que manipulara su token recibiría 403 o 404.
library;

import 'dart:convert';

import '../../dominio/acceso.dart';
import '../../dominio/sesion.dart';

Sesion sesionDesdeTokens({
  required String acceso,
  required String refresco,
  int? expiraEnSegundos,
  DateTime Function()? ahora,
}) {
  final claims = claimsDe(acceso);
  final correo = (claims['email'] ?? '') as String;
  final exp = claims['exp'];
  // Se prefiere `exp` del token: es un instante absoluto del emisor, y el
  // relativo arrastra el desfase de reloj del dispositivo.
  final expira = exp is num
      ? DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000, isUtc: true)
      : (ahora ?? () => DateTime.now().toUtc())().add(Duration(seconds: expiraEnSegundos ?? 300));
  return Sesion(
    tokenDeAcceso: acceso,
    tokenDeRefresco: refresco,
    expiraEn: expira,
    usuarioId: (claims['usuario_id'] ?? claims['sub'] ?? '') as String,
    copropiedadId: claims['copropiedad_id'] as String?,
    // C-36 · el correo sintético viaja en el token, pero no se enseña.
    correo: esCorreoSintetico(correo) ? '' : correo,
    debeCambiarContrasena: claims['debe_cambiar_contrasena'] == true,
  );
}

/// Carga útil del JWT, sin verificar la firma (ver arriba).
Map<String, dynamic> claimsDe(String jwt) {
  try {
    final partes = jwt.split('.');
    if (partes.length < 2) return const {};
    final normalizado = base64Url.normalize(partes[1]);
    return jsonDecode(utf8.decode(base64Url.decode(normalizado))) as Map<String, dynamic>;
  } catch (_) {
    return const {};
  }
}
