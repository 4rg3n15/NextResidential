import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';

/// 15-Y3 · los umbrales de la app son EXACTAMENTE los del fichero compartido
/// con la consola (`packages/contracts/src/umbrales-de-calidad.json`). Dart no
/// puede leer un JSON en tiempo de compilación sin empaquetarlo como recurso,
/// así que las constantes viven en `calidad_de_captura.dart` y esta prueba las
/// contrasta con el fichero: cambiar uno sin el otro la rompe a propósito.
void main() {
  test('los umbrales por defecto coinciden con packages/contracts/src/umbrales-de-calidad.json', () {
    final fichero = File('../../packages/contracts/src/umbrales-de-calidad.json');
    expect(fichero.existsSync(), isTrue, reason: 'falta el fichero compartido');
    final json = jsonDecode(fichero.readAsStringSync()) as Map<String, dynamic>;
    const u = UmbralesDeCalidad();
    expect(json['nitidezMinima'], u.nitidezMinima);
    expect(json['iluminacionMinima'], u.iluminacionMinima);
    expect(json['iluminacionMaxima'], u.iluminacionMaxima);
    expect(json['proporcionMinima'], u.proporcionMinima);
    expect(json['proporcionMaxima'], u.proporcionMaxima);
  });
}
