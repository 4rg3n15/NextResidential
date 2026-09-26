/// El acceso del residente POR LA API (D1, ADR-023, ETAPA 15-I).
///
/// ─────────────────────────────────────────────────────────────────────────────
/// POR QUÉ LA APP YA NO ENTRA DIRECTAMENTE CONTRA SUPABASE
///
/// Una cuenta por usuario se autentica en el proveedor con un correo SINTÉTICO
/// que sólo conoce la API y que no sale de ella. La app no puede construirlo
/// —ni debe—, así que entra por `POST /auth/acceso` con el código de la
/// copropiedad, su usuario y su contraseña, igual que la consola. Ahí viven,
/// además, el límite de intentos por cuenta y el tiempo uniforme de los fallos.
///
/// La RENOVACIÓN sigue siendo contra el proveedor: los tokens que devuelve la
/// API son los suyos, y canjear un token de refresco no necesita identificador.
/// ─────────────────────────────────────────────────────────────────────────────
library;

import 'package:dio/dio.dart';

import '../../dominio/acceso.dart';
import '../../dominio/puertos.dart';
import '../../dominio/sesion.dart';
import '../api/generado/clients/cuentas_api.dart';
import '../api/generado/models/acceso_dto.dart';
import 'claims.dart';

class AutenticadorPorApi implements Autenticador {
  AutenticadorPorApi({required CuentasApi api, required Autenticador renovacion})
    : _api = api,
      _renovacion = renovacion;

  final CuentasApi _api;
  final Autenticador _renovacion;

  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso identificador, {required String clave}) async {
    final cuerpo = switch (identificador) {
      PorCorreo(correo: final c) => AccesoDto(correo: c, contrasena: clave),
      PorUsuario(codigo: final c, usuario: final u) => AccesoDto(
        codigo: c,
        usuario: u,
        contrasena: clave,
      ),
    };
    try {
      final dto = await _api.cuentasControllerAcceso(body: cuerpo);
      final sesion = sesionDesdeTokens(acceso: dto.accessToken, refresco: dto.refreshToken);
      // El indicador viaja en el token y en la respuesta: basta con uno cierto.
      return dto.debeCambiarContrasena && !sesion.debeCambiarContrasena
          ? Sesion(
              tokenDeAcceso: sesion.tokenDeAcceso,
              tokenDeRefresco: sesion.tokenDeRefresco,
              expiraEn: sesion.expiraEn,
              usuarioId: sesion.usuarioId,
              copropiedadId: sesion.copropiedadId,
              correo: sesion.correo,
              debeCambiarContrasena: true,
            )
          : sesion;
    } on DioException catch (e) {
      throw _traducir(e);
    }
  }

  @override
  Future<Sesion> renovar(Sesion sesion) => _renovacion.renovar(sesion);

  Fallo _traducir(DioException e) {
    if (e.type == DioExceptionType.connectionError ||
        e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      // Sin red no se dice «credenciales incorrectas»: mandaría a reescribir
      // una contraseña que estaba bien.
      return const Fallo(ClaseDeFallo.sinConexion, 'No hay conexión con el servidor');
    }
    return switch (e.response?.statusCode) {
      400 ||
      401 => const Fallo(ClaseDeFallo.sesionInvalida, 'Código, usuario o contraseña incorrectos'),
      429 => const Fallo(
        ClaseDeFallo.servidor,
        'Demasiados intentos. Espere un minuto y vuelva a intentarlo.',
      ),
      403 => Fallo(ClaseDeFallo.sinPermiso, _mensaje(e.response?.data) ?? 'Acceso no habilitado'),
      _ => const Fallo(ClaseDeFallo.servidor, 'El servidor no pudo atender el acceso'),
    };
  }

  String? _mensaje(Object? cuerpo) {
    if (cuerpo is! Map) return null;
    final m = cuerpo['mensaje'];
    if (m is String) return m;
    if (m is Map && m['message'] is String) return m['message'] as String;
    return null;
  }
}
