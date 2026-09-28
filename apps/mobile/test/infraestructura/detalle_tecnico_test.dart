import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/causa_de_red.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/api/generado/clients/cuentas_api.dart';
import 'package:ncr_residente/infraestructura/api/soporte_de_api.dart';
import 'package:ncr_residente/infraestructura/sesion/autenticador_por_api.dart';
import 'package:ncr_residente/presentacion/widgets/detalle_de_fallo.dart';

import '../dobles/servidor_falso.dart';

/// H-SITIO-11 · en sitio el iPhone decía «No hay conexión con el servidor» y
/// Safari abría la API. Sin la URL compilada, el tipo de excepción y su
/// mensaje no se distinguía un permiso de red local de una URL mal compilada.
class SinRenovacion implements Autenticador {
  @override
  Future<Sesion> iniciarSesion(
    IdentificadorDeAcceso i, {
    required String clave,
  }) => throw UnimplementedError();
  @override
  Future<Sesion> renovar(Sesion sesion) => throw UnimplementedError();
}

void main() {
  final tokenFalso = jwtCon({'sub': 'x', 'exp': 1});

  DioException redCaida(RequestOptions o) => DioException(
    requestOptions: o,
    type: DioExceptionType.connectionError,
    message: 'The connection errored: con $tokenFalso dentro',
    error: const SocketException(
      'No route to host',
      osError: OSError('No route to host', 65),
    ),
  );

  test(
    'el acceso sin red lleva la URL compilada, el tipo y la causa',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://192.0.2.10:3000'))
        ..httpClientAdapter = ServidorFalso((o) => throw redCaida(o));
      final a = AutenticadorPorApi(
        api: CuentasApi(dio),
        renovacion: SinRenovacion(),
      );

      final fallo = await a
          .iniciarSesion(
            const PorUsuario(codigo: 'MIRA', usuario: 'ana'),
            clave: 'x',
          )
          .then<Fallo?>((_) => null, onError: (Object e) => e as Fallo);

      expect(fallo!.clase, ClaseDeFallo.sinConexion);
      // E2 (15-L) · ya no «No hay conexión»: sin saber la red, la causa y la
      // comprobación con Safari.
      expect(fallo.detalle, contains('http://192.0.2.10:3000/health'));
      final d = fallo.detalleTecnico!;
      expect(d, contains('URL base: http://192.0.2.10:3000'));
      expect(d, contains('tipo: connectionError'));
      expect(d, contains('No route to host'));
    },
  );

  test(
    'E2 · en Wi-Fi con «No route to host», la causa es el permiso de red local',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://192.0.2.10:3000'))
        ..httpClientAdapter = ServidorFalso((o) => throw redCaida(o));
      final a = AutenticadorPorApi(
        api: CuentasApi(dio),
        renovacion: SinRenovacion(),
        consultarRed: () async => TipoDeRed.wifi,
      );
      final fallo = await a
          .iniciarSesion(
            const PorUsuario(codigo: 'MIRA', usuario: 'ana'),
            clave: 'x',
          )
          .then<Fallo?>((_) => null, onError: (Object e) => e as Fallo);
      expect(fallo!.detalle, contains('Red local'));
    },
  );

  test(
    'E2 · con datos móviles lo dice, y no manda a revisar la contraseña',
    () async {
      final dio = Dio(BaseOptions(baseUrl: 'http://192.0.2.10:3000'))
        ..httpClientAdapter = ServidorFalso((o) => throw redCaida(o));
      final a = AutenticadorPorApi(
        api: CuentasApi(dio),
        renovacion: SinRenovacion(),
        consultarRed: () async => TipoDeRed.datosMoviles,
      );
      final fallo = await a
          .iniciarSesion(
            const PorUsuario(codigo: 'MIRA', usuario: 'ana'),
            clave: 'x',
          )
          .then<Fallo?>((_) => null, onError: (Object e) => e as Fallo);
      expect(fallo!.detalle, contains('datos móviles'));
      expect(fallo.detalle, isNot(contains('contraseña')));
    },
  );

  test('el detalle técnico NO lleva tokens ni la cabecera de autorización', () {
    final o = RequestOptions(
      baseUrl: 'http://192.0.2.10:3000',
      path: '/copropiedades/c/mi/vivienda?t=abc',
      headers: {'Authorization': 'Bearer $tokenFalso'},
    );
    final d = detalleTecnicoDe(redCaida(o));
    expect(d, isNot(contains('eyJ')));
    expect(d, isNot(contains(tokenFalso)));
    expect(d, contains('[token]'));
    expect(d, isNot(contains('t=abc')));
    expect(
      sinTokens('Authorization: Bearer abc.def'),
      'Authorization: Bearer [token]',
    );
  });

  testWidgets('el panel se ve en Debug y NO en Release', (tester) async {
    const fallo = Fallo(
      ClaseDeFallo.sinConexion,
      'Sin red',
      detalleTecnico: 'URL base: x',
    );
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: DetalleDeFallo(fallo: fallo, mostrar: true)),
      ),
    );
    expect(find.text('Detalle técnico (sólo en Debug)'), findsOneWidget);
    await tester.tap(find.text('Detalle técnico (sólo en Debug)'));
    await tester.pumpAndSettle();
    expect(find.text('URL base: x'), findsOneWidget);

    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(body: DetalleDeFallo(fallo: fallo, mostrar: false)),
      ),
    );
    expect(find.text('Detalle técnico (sólo en Debug)'), findsNothing);
  });

  testWidgets('sin detalle técnico no pinta nada', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: DetalleDeFallo(
            fallo: Fallo(ClaseDeFallo.servidor, 'x'),
            mostrar: true,
          ),
        ),
      ),
    );
    expect(find.byKey(const Key('detalle-de-fallo')), findsNothing);
  });
}
