/// F4 · la casilla de la foto, decisión final del cliente: una frase en
/// primera persona con el nombre del visitante dentro.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/casilla_de_la_foto.dart';

void main() {
  test('dice el nombre del visitante, palabra por palabra', () {
    expect(
      textoDeLaCasilla('Ana Ruiz'),
      'Declaro que Ana Ruiz me autorizó a usar su foto para su ingreso al conjunto',
    );
  });

  test('el nombre entra sin los espacios de los bordes', () {
    expect(
      textoDeLaCasilla('  Plomero Pérez \n'),
      'Declaro que Plomero Pérez me autorizó a usar su foto para su ingreso al conjunto',
    );
  });

  test('con el campo vacío, o sólo con espacios, dice «el visitante»: nunca un hueco', () {
    const sinNombre =
        'Declaro que el visitante me autorizó a usar su foto para su ingreso al conjunto';
    expect(textoDeLaCasilla(''), sinNombre);
    expect(textoDeLaCasilla('   '), sinNombre);
  });
}
