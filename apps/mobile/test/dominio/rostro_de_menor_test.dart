/// 15-X (D3) · lo que la ficha de un menor ofrece de su rostro, por su edad (la
/// del servidor) y por quién mira: sólo el titular, y de 15 a 17 años.
library;

import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/rostro_de_menor.dart';

import '../dobles/hogar_15w_falso.dart';

void main() {
  RostroDelMenorEnLaApp para(int? edad, {bool titular = true}) =>
      rostroDelMenorEnLaApp(menorDePrueba(edad: edad), esTitular: titular);

  test('el titular, con 15, 16 o 17 años: lo gestiona', () {
    expect(edadMinimaDelRostroDeMenor, 15);
    for (final edad in [15, 16, 17]) {
      expect(para(edad), RostroDelMenorEnLaApp.gestionar, reason: '$edad años');
    }
  });

  test('otro adulto del hogar: se le explica que lo registra el titular', () {
    expect(para(16, titular: false), RostroDelMenorEnLaApp.soloElTitular);
    expect(explicacionDelRostroDelMenor(RostroDelMenorEnLaApp.soloElTitular), contains('titular'));
  });

  test('con 14 años, para nadie: desde los 15', () {
    expect(para(14), RostroDelMenorEnLaApp.desdeLos15);
    expect(para(14, titular: false), RostroDelMenorEnLaApp.desdeLos15);
    expect(explicacionDelRostroDelMenor(RostroDelMenorEnLaApp.desdeLos15), contains('15 años'));
  });

  test('con 18 cumplidos, ya es mayor: nada que explicar aquí', () {
    expect(para(18), RostroDelMenorEnLaApp.yaEsMayor);
    expect(explicacionDelRostroDelMenor(RostroDelMenorEnLaApp.yaEsMayor), isNull);
  });

  test('sin edad conocida: que registren su fecha', () {
    expect(para(null), RostroDelMenorEnLaApp.sinFecha);
    expect(explicacionDelRostroDelMenor(RostroDelMenorEnLaApp.sinFecha), contains('fecha'));
    expect(explicacionDelRostroDelMenor(RostroDelMenorEnLaApp.gestionar), isNull);
  });
}
