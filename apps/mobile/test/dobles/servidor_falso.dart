import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';

/// Transporte falso para los adaptadores de la 15-I: guarda cada petición con
/// su cuerpo y deja que la prueba decida la respuesta.
class ServidorFalso implements HttpClientAdapter {
  ServidorFalso(this.responder);
  final ResponseBody Function(RequestOptions opciones) responder;
  final List<RequestOptions> peticiones = [];

  /// El cuerpo JSON de la petición `i`, ya descodificado.
  Map<String, dynamic> cuerpo(int i) {
    // Ida y vuelta por JSON: es lo que ve el servidor (los enumerados del
    // cliente generado se serializan con su `toJson`).
    final d = peticiones[i].data;
    return jsonDecode(d is String ? d : jsonEncode(d)) as Map<String, dynamic>;
  }

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    peticiones.add(options);
    return responder(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody json(int codigo, Object cuerpo) => ResponseBody.fromString(
      jsonEncode(cuerpo),
      codigo,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

/// JWT sin firmar: la app no verifica la firma (lo hace el servidor).
String jwtCon(Map<String, dynamic> claims) {
  String b64(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${b64({'alg': 'RS256'})}.${b64(claims)}.firma';
}
