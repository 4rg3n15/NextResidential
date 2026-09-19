/// Autenticación contra Supabase Auth, con la llave PUBLICABLE.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ LA APP HABLA CON SUPABASE Y LA CONSOLA NO
///
/// La consola web guarda la sesión en cookies `httpOnly` que pone su propio
/// servidor: el navegador nunca ve el token, y eso es lo correcto contra XSS.
/// Una app móvil no tiene ese intermediario —ni cookies `httpOnly`—, así que
/// obtiene el token directamente del emisor y lo guarda en el llavero del
/// sistema. Es el reparto que `CONEXION_SUPABASE.md` fija: la llave publicable
/// en web y móvil, la secreta solo en servidor.
///
/// ─────────────────────────────────────────────────────────────────────────────
/// LOS CLAIMS SE LEEN, NO SE CREEN
///
/// `_claimsDe` descodifica la carga útil del JWT **sin verificar la firma**, y
/// eso está bien siempre que se entienda para qué: la app necesita saber a qué
/// copropiedad apuntar la ruta y qué usuario es, que son datos de navegación.
/// La autorización la decide el servidor, que sí verifica la firma contra el
/// JWKS (ETAPA 03). Un residente que manipulara su token para poner otra
/// copropiedad recibiría 404 en toda ruta: no gana nada.
library;

import 'dart:convert';

import 'package:dio/dio.dart';

import '../../dominio/puertos.dart';
import '../../dominio/sesion.dart';

class AutenticadorSupabase implements Autenticador {
  AutenticadorSupabase({
    required Dio dio,
    required String urlBase,
    required String clavePublicable,
  })  : _dio = dio,
        _urlBase = urlBase,
        _clave = clavePublicable;

  final Dio _dio;
  final String _urlBase;
  final String _clave;

  @override
  Future<Sesion> iniciarSesion({required String correo, required String clave}) =>
      _pedirToken(
        ruta: 'token?grant_type=password',
        cuerpo: {'email': correo, 'password': clave},
      );

  @override
  Future<Sesion> renovar(Sesion sesion) => _pedirToken(
        ruta: 'token?grant_type=refresh_token',
        cuerpo: {'refresh_token': sesion.tokenDeRefresco},
      );

  Future<Sesion> _pedirToken({
    required String ruta,
    required Map<String, String> cuerpo,
  }) async {
    try {
      final respuesta = await _dio.post<Map<String, dynamic>>(
        '$_urlBase/auth/v1/$ruta',
        data: cuerpo,
        options: Options(
          headers: {'apikey': _clave, 'Content-Type': 'application/json'},
          // Los 4xx se manejan abajo como fallos tipados; sin esto Dio lanza y
          // el `catch` no distingue un 400 de un socket cerrado.
          validateStatus: (c) => c != null && c < 500,
        ),
      );
      final datos = respuesta.data;
      if (respuesta.statusCode != 200 || datos == null) {
        throw Fallo(
          ClaseDeFallo.sesionInvalida,
          _mensajeDe(datos) ?? 'Correo o contraseña incorrectos',
        );
      }
      return _sesionDe(datos);
    } on DioException catch (e) {
      // Sin red no se dice «credenciales incorrectas»: mandaría al residente a
      // teclear otra vez una contraseña que estaba bien.
      throw Fallo(
        e.type == DioExceptionType.connectionError || e.type == DioExceptionType.connectionTimeout
            ? ClaseDeFallo.sinConexion
            : ClaseDeFallo.servidor,
        e.message ?? 'No se pudo hablar con el servidor de identidad',
      );
    }
  }

  String? _mensajeDe(Map<String, dynamic>? datos) {
    if (datos == null) return null;
    final m = datos['error_description'] ?? datos['msg'] ?? datos['message'];
    return m is String ? m : null;
  }

  Sesion _sesionDe(Map<String, dynamic> datos) {
    final acceso = datos['access_token'] as String?;
    final refresco = datos['refresh_token'] as String?;
    if (acceso == null || refresco == null) {
      throw const Fallo(ClaseDeFallo.servidor, 'La respuesta de identidad no trae tokens');
    }
    final claims = _claimsDe(acceso);
    final expiraEnSegundos = (datos['expires_in'] as num?)?.toInt();
    final exp = claims['exp'];

    // Se prefiere `exp` del token sobre `expires_in`: el primero es un instante
    // absoluto del emisor y el segundo es relativo a la recepción, que arrastra
    // el desfase de reloj del dispositivo — el mismo desfase que justifica el
    // margen de refresco.
    final expira = exp is num
        ? DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000, isUtc: true)
        : DateTime.now().toUtc().add(Duration(seconds: expiraEnSegundos ?? 300));

    return Sesion(
      tokenDeAcceso: acceso,
      tokenDeRefresco: refresco,
      expiraEn: expira,
      usuarioId: (claims['usuario_id'] ?? claims['sub'] ?? '') as String,
      copropiedadId: claims['copropiedad_id'] as String?,
      correo: (claims['email'] ?? '') as String,
    );
  }

  /// Carga útil del JWT. Sin verificar firma, y a propósito: ver la cabecera.
  Map<String, dynamic> _claimsDe(String jwt) {
    try {
      final partes = jwt.split('.');
      if (partes.length < 2) return const {};
      final normalizado = base64Url.normalize(partes[1]);
      return jsonDecode(utf8.decode(base64Url.decode(normalizado))) as Map<String, dynamic>;
    } catch (_) {
      return const {};
    }
  }
}
