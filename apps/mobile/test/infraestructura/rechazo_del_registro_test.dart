/// 15-Z2 (DT-15W-01) · los rechazos de «Crear cuenta» se deciden por el
/// `codigo` del 409, no por su texto: el usuario ocupado va bajo «Usuario».
library;

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/registro.dart';
import 'package:ncr_residente/infraestructura/api/registro_api.dart';
import 'package:ncr_residente/infraestructura/api/soporte_de_api.dart';

DioException con(int estado, Map<String, Object?> cuerpo) {
  final opciones = RequestOptions(path: '/registro');
  return DioException(
    requestOptions: opciones,
    response: Response(
      requestOptions: opciones,
      statusCode: estado,
      data: cuerpo,
    ),
    type: DioExceptionType.badResponse,
  );
}

void main() {
  test(
    '409 USUARIO_NO_DISPONIBLE: el texto del servidor, bajo el campo «usuario»',
    () {
      final r = rechazoDelRegistro(
        con(409, {
          'estado': 409,
          'mensaje': {
            'message': 'Ese usuario no está disponible',
            'codigo': 'USUARIO_NO_DISPONIBLE',
          },
        }),
      );
      expect(r, isA<RegistroConErrores>());
      expect((r as RegistroConErrores).campos, {
        'usuario': 'Ese usuario no está disponible',
      });
    },
  );

  test('409 sin código (API anterior) o con otro código: rechazo general con su texto', () {
    final sinCodigo = rechazoDelRegistro(
      con(409, {
        'estado': 409,
        'mensaje': {'message': 'Esa cuenta ya tiene vivienda'},
      }),
    );
    expect(sinCodigo, isA<RegistroRechazado>());
    expect(
      (sinCodigo as RegistroRechazado).mensaje,
      'Esa cuenta ya tiene vivienda',
    );
    final otro = rechazoDelRegistro(
      con(409, {
        'estado': 409,
        'mensaje': {
          'message': 'Esa cuenta ya tiene vivienda',
          'codigo': 'CUENTA_CON_VIVIENDA',
        },
      }),
    );
    expect(otro, isA<RegistroRechazado>());
  });

  test('todo 409 llega como Fallo con su código; los demás, sin él', () {
    final f = falloDeDio(
      con(409, {
        'estado': 409,
        'mensaje': {
          'message': 'La política del rostro cambió',
          'codigo': 'POLITICA_CAMBIADA',
        },
      }),
    );
    expect(
      (f.clase, f.codigo, f.detalle),
      (
        ClaseDeFallo.servidor,
        'POLITICA_CAMBIADA',
        'La política del rostro cambió',
      ),
    );
    final sin = falloDeDio(
      con(403, {'estado': 403, 'mensaje': 'Rol no autorizado'}),
    );
    expect((sin.clase, sin.codigo), (ClaseDeFallo.sinPermiso, null));
  });
}
