/// Lo que comparten todos los adaptadores de la API: la traducción de los
/// fallos de Dio a `Fallo` y la copropiedad de la ruta.
///
/// Vivía dentro de `RepositorioApiDelResidente`. La ETAPA 15-I añadió tres
/// adaptadores más —alta, hogar y cuenta— y copiar la traducción en cada uno
/// habría dejado cuatro versiones de «qué es un 404» que acabarían divergiendo.
library;

import 'package:dio/dio.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/puertos.dart';

/// Ejecuta la llamada y convierte cualquier `DioException` en un `Fallo`
/// tipado: la excepción de Dio no sale de la capa de infraestructura.
Future<T> pedirALaApi<T>(Future<T> Function() llamada) async {
  try {
    return await llamada();
  } on DioException catch (e) {
    throw falloDeDio(e);
  }
}

Fallo falloDeDio(DioException e) {
  if (e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout) {
    return Fallo(ClaseDeFallo.sinConexion, e.message ?? 'Sin conexión');
  }
  final codigo = e.response?.statusCode;
  final detalle = detalleDeError(e.response?.data) ?? e.message ?? 'Error de servidor';
  return switch (codigo) {
    401 => Fallo(ClaseDeFallo.sesionInvalida, detalle),
    403 => Fallo(ClaseDeFallo.sinPermiso, detalle),
    404 => Fallo(ClaseDeFallo.sinVivienda, detalle),
    _ => Fallo(ClaseDeFallo.servidor, detalle),
  };
}

/// El cuerpo de error de la API tiene forma `{estado, correlacion, mensaje}`
/// —el filtro global de `main.ts`—, y `mensaje` puede ser a su vez el objeto
/// de Nest. Se extrae el texto útil sin suponer una sola forma, porque
/// suponerla fue justo lo que rompió la suite de la API cuando el filtro
/// global no estaba en el banco de pruebas.
String? detalleDeError(dynamic datos) {
  if (datos is Map) {
    final mensaje = datos['mensaje'] ?? datos['message'];
    if (mensaje is String) return mensaje;
    if (mensaje is Map) {
      final interno = mensaje['message'];
      if (interno is String) return interno;
      if (interno is List && interno.isNotEmpty) return interno.join(', ');
    }
  }
  return null;
}

/// La copropiedad de la ruta sale de los claims de la sesión.
///
/// No es un dato que el residente elija: si su token no la trae, ninguna ruta
/// de la API es alcanzable y decirlo así —«su cuenta no está asociada a un
/// conjunto»— es más útil que un 404 sin contexto.
String copropiedadDeLaSesion(SesionEnUso sesion) {
  final id = sesion.sesion?.copropiedadId;
  if (id == null || id.isEmpty) {
    throw const Fallo(
      ClaseDeFallo.sinPermiso,
      'Su cuenta no está asociada a ninguna copropiedad. El administrador del '
      'conjunto tiene que vincularla a su vivienda.',
    );
  }
  return id;
}
