/// Lo que comparten todos los adaptadores de la API: la traducción de los
/// fallos de Dio a `Fallo` y la copropiedad de la ruta.
///
/// Vivía dentro de `RepositorioApiDelResidente`. La ETAPA 15-I añadió tres
/// adaptadores más —alta, hogar y cuenta— y copiar la traducción en cada uno
/// habría dejado cuatro versiones de «qué es un 404» que acabarían divergiendo.
library;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/causa_de_red.dart';
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

/// H-SITIO-11 · la URL base compilada, el tipo de `DioException` y su mensaje,
/// para el panel de Debug. SIN tokens: se tachan los JWT y las cabeceras
/// `Bearer` que un mensaje pudiera arrastrar, y nunca se leen las cabeceras
/// de la petición. La consulta de la URL se quita: ahí no hay nada que
/// diagnosticar y sí podría haber un identificador.
String detalleTecnicoDe(DioException e) {
  final base = e.requestOptions.baseUrl.isEmpty ? '(vacía)' : e.requestOptions.baseUrl;
  final ruta = e.requestOptions.path.split('?').first;
  final partes = <String>[
    'URL base: $base',
    'ruta: $ruta',
    'tipo: ${e.type.name}',
    if (e.message != null && e.message!.isNotEmpty) 'mensaje: ${e.message}',
    if (e.error != null) 'causa: ${e.error}',
  ];
  return sinTokens(partes.join('\n'));
}

final _jwt = RegExp(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*');
final _portador = RegExp(r'Bearer\s+\S+', caseSensitive: false);

/// Tacha lo que tenga forma de credencial. Es la segunda barrera: la primera
/// es no leer nunca las cabeceras.
String sinTokens(String texto) =>
    texto.replaceAll(_jwt, '[token]').replaceAll(_portador, 'Bearer [token]');

/// 15-L · la dirección del servidor ya no es fija: los `Dio` que hablan con la
/// API la SIGUEN. Se fija ahora y cada vez que cambie.
void seguirLaDireccion(ValueListenable<String> direccion, List<Dio> dios) {
  void aplicar() {
    for (final d in dios) {
      d.options.baseUrl = direccion.value;
    }
  }

  aplicar();
  direccion.addListener(aplicar);
}

Fallo falloDeDio(DioException e) {
  if (e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.receiveTimeout) {
    // El mensaje de Dio está en inglés y habla de sockets. El residente lee la
    // causa en su idioma y con la dirección a la que se intentó llegar.
    final causa = causaDeRed(
      red: TipoDeRed.desconocida,
      error: '${e.error ?? ''} ${e.message ?? ''}',
      agotoElTiempo: e.type != DioExceptionType.connectionError,
    );
    return Fallo(
      ClaseDeFallo.sinConexion,
      mensajeDeCausa(causa, e.requestOptions.baseUrl),
      detalleTecnico: detalleTecnicoDe(e),
    );
  }
  final codigo = e.response?.statusCode;
  final detalle = detalleDeError(e.response?.data) ?? e.message ?? 'Error de servidor';
  return switch (codigo) {
    // 400 y 422 son la FORMA de lo enviado. No se mezclan con `servidor`
    // porque la bandeja de salida reintenta `servidor`, y reintentar ocho
    // veces un formulario al que le falta la casilla sólo retrasa decirlo.
    // [SUPUESTO] S-87: todo 400/422 es de la forma, nunca transitorio.
    400 || 422 => Fallo(ClaseDeFallo.datosNoValidos, detalle),
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
    if (mensaje is String) return sinCodigosDelProyecto(mensaje);
    if (mensaje is Map) {
      final interno = mensaje['message'];
      if (interno is String) return sinCodigosDelProyecto(interno);
      if (interno is List && interno.isNotEmpty) {
        return interno.map((m) => sinCodigosDelProyecto('$m')).join(', ');
      }
    }
  }
  return null;
}

const _codigo = r'(?:RN|KPI|KP1|CA|HU|CU|OE|D|P|S|C|E|H-SITIO|BE)-?\d{1,3}[a-z]?';
final _codigosEntreParentesis = RegExp(r'\s*\((?:\s*' + _codigo + r'\s*,?)+\)');
final _codigoDeEntrada = RegExp(r'^\s*' + _codigo + r'\s*·\s*');

/// Bloque I (15-L) · la API explica sus rechazos citando la regla que los
/// produce —«Dele de baja en vez de borrarla (RN-19)», «D-11 · …»—: útil en su
/// registro, ajeno a quien usa la app. Se quita la cita; el mensaje queda.
String sinCodigosDelProyecto(String texto) =>
    texto.replaceAll(_codigosEntreParentesis, '').replaceFirst(_codigoDeEntrada, '').trim();

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
