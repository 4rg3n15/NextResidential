/// La prueba de una dirección antes de guardarla: `GET <dirección>/health`.
///
/// La API contesta `{"estado":"vivo","momento":…}` con 200 (`SaludDto` del
/// contrato). Sólo eso se admite. Cualquier otra respuesta —un 404 de otro
/// servicio en el puerto, el HTML de un portal cautivo, un router— es «esa
/// dirección responde, pero no es un servidor de Next Control», que no es lo
/// mismo que «no hay respuesta» y se dice distinto.
///
/// El `Dio` es propio y de usar y tirar: sin el interceptor de sesión (la
/// prueba no lleva token, `/health` es pública), con esperas cortas (es una
/// red local; si tarda más de seis segundos, algo va mal) y sin seguir
/// redirecciones (una dirección que redirige a otra no es la que se escribió).
library;

import 'dart:convert';

import 'package:dio/dio.dart';

import '../../dominio/causa_de_red.dart';
import '../../dominio/direccion_del_servidor.dart';
import 'generado/models/salud_dto.dart';

class ComprobadorPorHttp implements ComprobadorDeServidor {
  ComprobadorPorHttp({
    HttpClientAdapter? adaptador,
    this.espera = const Duration(seconds: 6),
  }) : _adaptador = adaptador;

  /// Inyectable para probar las respuestas sin red.
  final HttpClientAdapter? _adaptador;
  final Duration espera;

  @override
  Future<SaludDelServidor> comprobar(String url) async {
    final dio = Dio(
      BaseOptions(
        baseUrl: url,
        connectTimeout: espera,
        receiveTimeout: espera,
        followRedirects: false,
        responseType: ResponseType.plain,
        // Toda respuesta llega como respuesta: el código se juzga aquí, no en
        // una excepción que obligaría a adivinar si hubo servidor o no.
        validateStatus: (_) => true,
      ),
    );
    final adaptador = _adaptador;
    if (adaptador != null) dio.httpClientAdapter = adaptador;
    try {
      final r = await dio.get<String>('/health');
      return r.statusCode == 200 && _esSaludDeNextControl(r.data)
          ? SaludDelServidor.responde
          : SaludDelServidor.noEsNextControl;
    } on DioException catch (e) {
      return saludDeFallo(e);
    } finally {
      dio.close(force: true);
    }
  }
}

bool _esSaludDeNextControl(String? cuerpo) {
  try {
    final j = jsonDecode(cuerpo ?? '');
    return j is Map<String, Object?> && SaludDto.fromJson(j).estado == 'vivo';
  } on Object {
    // No es JSON, o no tiene la forma del contrato.
    return false;
  }
}

final _tls = RegExp(r'Handshake|CERTIFICATE|certificate', caseSensitive: false);

/// Qué dice un fallo de transporte sobre la dirección probada.
SaludDelServidor saludDeFallo(DioException e) {
  switch (e.type) {
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.transformTimeout:
      return SaludDelServidor.tiempoAgotado;
    case DioExceptionType.badCertificate:
      return SaludDelServidor.certificadoInvalido;
    case DioExceptionType.badResponse:
      return SaludDelServidor.noEsNextControl;
    case DioExceptionType.cancel:
      return SaludDelServidor.sinRespuesta;
    case DioExceptionType.connectionError:
    case DioExceptionType.unknown:
      final texto = '${e.error ?? ''} ${e.message ?? ''}';
      if (_tls.hasMatch(texto)) return SaludDelServidor.certificadoInvalido;
      // La misma clasificación que el resto de la app (`causa_de_red.dart`):
      // un nombre `.local` que la red no resuelve y una IP equivocada no se
      // arreglan igual, y el mensaje tiene que decir cuál de las dos es.
      return switch (causaDeRed(red: TipoDeRed.desconocida, error: texto, agotoElTiempo: false)) {
        CausaDeRed.direccionInvalida => SaludDelServidor.nombreDesconocido,
        CausaDeRed.servidorApagado => SaludDelServidor.rechazaConexion,
        CausaDeRed.redLocalDenegada => SaludDelServidor.redLocalDenegada,
        _ => SaludDelServidor.sinRespuesta,
      };
  }
}
