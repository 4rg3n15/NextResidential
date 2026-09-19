import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/sesion/autenticador_supabase.dart';

/// El autenticador contra Supabase, sin tocar Supabase.
///
/// Lo que hay que demostrar aquí no es que sepa hacer un POST: es que **lee la
/// caducidad del `exp` del token y no del `expires_in` de la respuesta**, y que
/// un fallo de red no se confunde con unas credenciales incorrectas. Las dos
/// cosas se ven en el teléfono de un usuario y ninguna se ve en el código.
class ServidorFalso implements HttpClientAdapter {
  ServidorFalso(this.responder);
  final ResponseBody Function(RequestOptions) responder;
  final List<RequestOptions> peticiones = [];

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

/// JWT sin firmar con los claims que emite el hook de la migración 0024. La
/// firma da igual: la app NO la verifica —lo hace el servidor contra el JWKS—
/// y eso está dicho en `autenticador_supabase.dart`.
String jwtCon(Map<String, dynamic> claims) {
  String b64(Map<String, dynamic> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${b64({'alg': 'RS256'})}.${b64(claims)}.firma-que-nadie-verifica-aqui';
}

/// Ver `tema_test.dart`: la llave se compone para no dejar su forma escrita.
const _prefijoPublicable = 'sb_publishable';
final llavePublicable = '${_prefijoPublicable}_de_prueba';

void main() {
  final expira = DateTime.utc(2026, 9, 18, 12, 5);
  final token = jwtCon({
    'sub': 'auth-1',
    'usuario_id': 'usr-1',
    'copropiedad_id': 'cop-1',
    'email': 'residente@ejemplo.invalid',
    'exp': expira.millisecondsSinceEpoch ~/ 1000,
  });

  ResponseBody ok() => ResponseBody.fromString(
        jsonEncode({
          'access_token': token,
          'refresh_token': 'refresco-1',
          'expires_in': 300,
        }),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      );

  AutenticadorSupabase construir(ServidorFalso servidor) {
    final dio = Dio()..httpClientAdapter = servidor;
    return AutenticadorSupabase(
      dio: dio,
      urlBase: 'https://proyecto.invalid',
      clavePublicable: llavePublicable,
    );
  }

  test('iniciar sesión lee identidad y copropiedad de los claims', () async {
    final servidor = ServidorFalso((_) => ok());
    final sesion = await construir(servidor).iniciarSesion(
      correo: 'residente@ejemplo.invalid',
      clave: 'x',
    );

    expect(sesion.usuarioId, 'usr-1');
    expect(sesion.copropiedadId, 'cop-1');
    expect(sesion.correo, 'residente@ejemplo.invalid');
    // La caducidad sale del `exp` del emisor, no de sumar `expires_in` a la
    // hora del teléfono: ese desfase es el que obliga al margen de refresco.
    expect(sesion.expiraEn, expira);
  });

  test('la petición lleva la llave PUBLICABLE en la cabecera apikey', () async {
    final servidor = ServidorFalso((_) => ok());
    await construir(servidor).iniciarSesion(correo: 'a@b.invalid', clave: 'x');

    expect(servidor.peticiones.single.headers['apikey'], llavePublicable);
    expect(servidor.peticiones.single.path, contains('grant_type=password'));
  });

  test('renovar usa el token de refresco, no la contraseña', () async {
    final servidor = ServidorFalso((_) => ok());
    final autenticador = construir(servidor);
    final sesion = await autenticador.iniciarSesion(correo: 'a@b.invalid', clave: 'x');
    await autenticador.renovar(sesion);

    expect(servidor.peticiones.last.path, contains('grant_type=refresh_token'));
    expect(
      (servidor.peticiones.last.data as Map)['refresh_token'],
      'refresco-1',
    );
  });

  test('unas credenciales rechazadas son sesión inválida, con el texto del emisor', () async {
    final servidor = ServidorFalso(
      (_) => ResponseBody.fromString(
        jsonEncode({'error_description': 'Invalid login credentials'}),
        400,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ),
    );

    await expectLater(
      construir(servidor).iniciarSesion(correo: 'a@b.invalid', clave: 'mala'),
      throwsA(
        isA<Fallo>()
            .having((f) => f.clase, 'clase', ClaseDeFallo.sesionInvalida)
            .having((f) => f.detalle, 'detalle', contains('Invalid login credentials')),
      ),
    );
  });

  test('sin red NO se dice «credenciales incorrectas»', () async {
    // Decirlo mandaría al residente a reescribir una contraseña que estaba
    // bien, que es el peor mensaje posible para el problema que tiene.
    final servidor = ServidorFalso(
      (opciones) => throw DioException(
        requestOptions: opciones,
        type: DioExceptionType.connectionError,
        message: 'no hay red',
      ),
    );

    await expectLater(
      construir(servidor).iniciarSesion(correo: 'a@b.invalid', clave: 'x'),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.sinConexion)),
    );
  });

  test('una respuesta sin tokens es un fallo de servidor, no una sesión a medias', () async {
    final servidor = ServidorFalso(
      (_) => ResponseBody.fromString(
        jsonEncode({'algo': 'otra cosa'}),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ),
    );

    await expectLater(
      construir(servidor).iniciarSesion(correo: 'a@b.invalid', clave: 'x'),
      throwsA(isA<Fallo>().having((f) => f.clase, 'clase', ClaseDeFallo.servidor)),
    );
  });

  test('un token ilegible no revienta: la sesión queda sin claims y el servidor decidirá', () async {
    final servidor = ServidorFalso(
      (_) => ResponseBody.fromString(
        jsonEncode({'access_token': 'no-es-un-jwt', 'refresh_token': 'r', 'expires_in': 300}),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
      ),
    );

    final sesion = await construir(servidor).iniciarSesion(correo: 'a@b.invalid', clave: 'x');
    expect(sesion.copropiedadId, isNull);
    // Y la caducidad cae al `expires_in`, que es lo único que queda.
    expect(sesion.expiraEn.isAfter(DateTime.now().toUtc()), isTrue);
  });
}
