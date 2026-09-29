/// C5 y C9 (15-M) · TODAS las fechas de la app en `DD-MM-YYYY`, con una sola
/// función, y la confirmación de la placa con la fecha en los DOS extremos.
///
/// «28/09» sin año y «28/09/2026» en la pantalla de al lado se leían distinto;
/// y «de 02:33 a 02:33» sin fecha hizo pasar una visita de 24 horas por una de
/// 0 minutos. Lo que se exige aquí es el formato, no el aspecto.
library;

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/presentacion/pantallas/comunes.dart';
import 'package:ncr_residente/presentacion/widgets/campos_de_visita.dart';

final desde = DateTime(2026, 9, 28, 18, 56);
final hasta = DateTime(2026, 9, 29, 6, 56);

void main() {
  group('fechaCorta · la única fecha corta de la app', () {
    test('DD-MM-YYYY con dos cifras en día y mes', () {
      expect(fechaCorta(DateTime(2026, 1, 3)), '03-01-2026');
      expect(fechaCorta(desde), '28-09-2026');
    });

    test('momentoLegible lleva la fecha con año y la hora en 24 h', () {
      expect(momentoLegible(desde), '28-09-2026 · 18:56');
    });

    test('el formulario de visita usa la misma función: nada de dd/MM/yyyy', () {
      expect(fechaLegible(desde), '28-09-2026');
      expect(horaLegible(desde), '18:56');
      expect(fechaLegible(desde), isNot(contains('/')));
    });

    test('la confirmación de la placa lleva la fecha en los dos extremos', () {
      expect(
        confirmacionDePlaca(placa: 'ABC123', visitante: 'Ana Pérez', desde: desde, hasta: hasta),
        'Placa ABC123 registrada para la visita de Ana Pérez, '
        'del 28-09-2026 18:56 al 29-09-2026 06:56',
      );
      expect(confirmacionDePlaca(placa: null, visitante: 'Ana', desde: desde, hasta: hasta), '');
    });
  });

  group('en pantalla', () {
    testWidgets('«Fecha» del formulario se escribe DD-MM-YYYY', (t) async {
      await t.pumpWidget(
        MaterialApp(
          localizationsDelegates: GlobalMaterialLocalizations.delegates,
          supportedLocales: const [Locale('es', 'CO')],
          locale: const Locale('es', 'CO'),
          home: Scaffold(
            body: CuandoYCuantoDura(
              inicio: desde,
              duracionMinutos: 120,
              hoy: DateTime(2026, 9, 20),
              alCambiarInicio: (_) {},
              alCambiarDuracion: (_) {},
            ),
          ),
        ),
      );
      expect(find.text('28-09-2026'), findsOneWidget);
      expect(find.textContaining('/'), findsNothing);

      // El selector de fecha abre en español de Colombia, no en inglés.
      await t.tap(find.byKey(const Key('visita.fecha')));
      await t.pumpAndSettle();
      final dialogo = find.byType(DatePickerDialog);
      expect(dialogo, findsOneWidget);
      expect(Localizations.localeOf(t.element(dialogo)), const Locale('es', 'CO'));
      expect(find.text('Select date'), findsNothing);
      expect(find.text('Cancel'), findsNothing);
      expect(find.text('Cancelar'), findsOneWidget);
    });

    testWidgets('el desenlace de la visita creada enseña la confirmación de la placa', (t) async {
      await t.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: DesenlaceDeVisita(
              resultado: const VisitaCreada(
                id: 'v1',
                repetida: false,
                equipos: 1,
                sincronizadas: 1,
                confirmacionDePlaca:
                    'Placa ABC123 registrada para la visita de Ana Pérez, del 28-09-2026 18:56 al 29-09-2026 06:56',
              ),
              alCerrar: () {},
            ),
          ),
        ),
      );
      expect(find.textContaining('Placa ABC123 registrada para la visita de Ana Pérez'), findsOneWidget);
      expect(find.textContaining('del 28-09-2026 18:56 al 29-09-2026 06:56'), findsOneWidget);
    });
  });
}
