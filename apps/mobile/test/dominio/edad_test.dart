import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/edad.dart';

/// RONDA 15-W · la edad con el día civil de Bogotá, la misma aritmética que el
/// servidor (`packages/domain-core/src/residente/edad.ts`). Aquí es CORTESÍA:
/// la decisión es del servidor, y por eso los avisos de los formularios llevan
/// un día de margen a favor de quien escribe.
void main() {
  group('el día civil es el de Bogotá, no el del teléfono ni el de UTC', () {
    test('a las 20:00 de Bogotá del día anterior, en UTC ya es el día siguiente', () {
      // 2026-05-17 01:00 UTC = 2026-05-16 20:00 en Bogotá.
      expect(diaCivilEnBogota(DateTime.utc(2026, 5, 17, 1)), '2026-05-16');
      expect(diaCivilEnBogota(DateTime.utc(2026, 5, 17, 5)), '2026-05-17');
    });

    test('quien cumple 18 mañana en Bogotá sigue teniendo 17 aunque en UTC ya sea mañana', () {
      final noche = DateTime.utc(2026, 5, 17, 1); // 16 de mayo, 20:00 en Bogotá
      expect(edadEn('2008-05-17', noche), 17);
      expect(edadEn('2008-05-17', DateTime.utc(2026, 5, 17, 5)), 18);
    });
  });

  group('edadEn', () {
    final hoy = DateTime.utc(2026, 10, 6, 15);

    test('cuenta los años cumplidos', () {
      expect(edadEn('1990-05-17', hoy), 36);
      expect(edadEn('2008-10-06', hoy), 18, reason: 'cumple hoy');
      expect(edadEn('2008-10-07', hoy), 17, reason: 'cumple mañana');
      expect(edadEn('2026-10-06', hoy), 0, reason: 'nació hoy');
    });

    test('el 29 de febrero cumple el 1 de marzo en los años no bisiestos', () {
      expect(edadEn('2008-02-29', DateTime.utc(2026, 2, 28, 15)), 17);
      expect(edadEn('2008-02-29', DateTime.utc(2026, 3, 1, 15)), 18);
    });

    test('una fecha que no es civil, anterior a 1900 o futura no tiene edad', () {
      expect(edadEn('2026-02-30', hoy), isNull);
      expect(edadEn('17-05-1990', hoy), isNull);
      expect(edadEn('1899-12-31', hoy), isNull);
      expect(edadEn('2026-10-07', hoy), isNull);
      expect(esFechaCivil('2024-02-29'), isTrue);
      expect(esFechaCivil('2025-02-29'), isFalse);
    });

    test('18 años o más tienen cuenta', () {
      expect(puedeTenerCuenta(18), isTrue);
      expect(puedeTenerCuenta(17), isFalse);
    });
  });

  group('cortesía de los formularios, con un día de margen a favor de quien escribe', () {
    final hoy = DateTime.utc(2026, 10, 6, 15);

    test('una cuenta: vacía, mal escrita, futura o de un menor no pasa', () {
      expect(motivoDeFechaDeAdulto('', hoy), 'Escriba su fecha de nacimiento');
      expect(motivoDeFechaDeAdulto('1990/05/17', hoy), contains('AAAA-MM-DD'));
      expect(motivoDeFechaDeAdulto('2030-01-01', hoy), 'Esa fecha todavía no llegó');
      expect(motivoDeFechaDeAdulto('2012-01-01', hoy), mensajeCuentaDeMenor);
      expect(motivoDeFechaDeAdulto(' 1990-05-17 ', hoy), isNull);
    });

    test('quien cumple 18 mañana no se bloquea en el teléfono: lo decide el servidor', () {
      // El reloj del teléfono puede ir un día atrasado; el servidor no.
      expect(motivoDeFechaDeAdulto('2008-10-07', hoy), isNull);
      expect(motivoDeFechaDeAdulto('2008-10-08', hoy), mensajeCuentaDeMenor);
    });

    test('un menor: el mayor de edad se avisa, el recién nacido no', () {
      expect(motivoDeFechaDeMenor('', hoy), 'Escriba la fecha de nacimiento');
      expect(motivoDeFechaDeMenor('2015-08-21', hoy), isNull);
      expect(motivoDeFechaDeMenor('2026-10-06', hoy), isNull, reason: 'nació hoy');
      expect(motivoDeFechaDeMenor('1990-05-17', hoy), mensajeMayorSinCuenta);
      expect(motivoDeFechaDeMenor('2027-01-01', hoy), 'Esa fecha todavía no llegó');
      // Cumple 18 hoy en Bogotá, pero con el reloj adelantado un día el
      // teléfono no lo puede asegurar: lo decide el servidor.
      expect(motivoDeFechaDeMenor('2008-10-06', hoy), isNull);
      expect(motivoDeFechaDeMenor('2008-10-05', hoy), mensajeMayorSinCuenta);
    });
  });
}
