import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/puertos.dart';

void main() {
  test('el fallo se imprime con su clase, que es lo que se busca en un registro', () {
    const f = Fallo(ClaseDeFallo.sinVivienda, 'no tiene vivienda activa');
    expect(f.toString(), 'Fallo(sinVivienda: no tiene vivienda activa)');
  });

  test('el reloj del sistema devuelve un instante creciente', () {
    // Trivial, y por eso está: `RelojDelSistema` es el único sitio de la app
    // donde se lee `DateTime.now()`. Si alguien lo cambiara por un valor fijo
    // —cosa que ha pasado en pruebas de otros proyectos—, esto lo delata.
    const reloj = RelojDelSistema();
    final a = reloj.ahora();
    final b = reloj.ahora();
    expect(b.isBefore(a), isFalse);
  });
}
