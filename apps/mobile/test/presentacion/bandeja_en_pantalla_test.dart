/// 15-L · UNA VISITA CREADA SIN SERVIDOR NO SE PIERDE, NI SE DUPLICA.
///
/// Se crea desde el formulario de verdad, sin red: queda «Pendiente de envío»
/// en Visitantes, sobrevive a cerrar la app, y al volver el servidor el ciclo
/// la envía SOLA, una vez. El servidor falso cuenta las llamadas POR CLAVE y
/// deduplica como el de verdad.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import '../dobles/app_de_prueba.dart';
import 'visitas_test.dart' show completarYRegistrar, lienzoAlto;

const clave = 'clave-de-prueba';

Future<void> abrir(WidgetTester t, Mundo mundo) async {
  final (app, _, _) = await mundo.arrancar();
  await t.pumpWidget(app);
  await t.pumpAndSettle();
  await t.tap(find.text('Visitantes'));
  await t.pumpAndSettle();
}

Future<void> registrarDesdeElFormulario(WidgetTester t) async {
  await t.tap(find.text('Nuevo visitante'));
  await t.pumpAndSettle();
  await completarYRegistrar(t);
}

void main() {
  testWidgets('SIN RED → «Pendiente de envío» → se cierra la app → vuelve la red → UNA vez',
      (t) async {
    lienzoAlto(t);
    final mundo = Mundo()..repo.hayRed = false;
    await abrir(t, mundo);

    await registrarDesdeElFormulario(t);
    expect(find.text('Quedó pendiente de enviarse'), findsOneWidget);
    await t.pageBack();
    await t.pumpAndSettle();
    expect(find.text('Pendiente de envío'), findsOneWidget);
    expect(find.text('Plomero Pérez'), findsOneWidget);

    // Se cierra la app y se vuelve a abrir, todavía sin red.
    await t.pumpWidget(const SizedBox());
    await abrir(t, mundo);
    expect(find.text('Pendiente de envío'), findsOneWidget, reason: 'sobrevivió al cierre');

    // Vuelve el servidor. Nadie toca nada: el ciclo la envía sola.
    mundo.repo.hayRed = true;
    mundo.reloj.avanzar(const Duration(minutes: 1));
    await t.pump(const Duration(seconds: 20));
    await t.pumpAndSettle();

    expect(mundo.repo.llamadasPorClave, {clave: 1}, reason: 'enviada UNA vez, con SU clave');
    expect(find.text('Se envió 1 visita que estaba pendiente.'), findsOneWidget);
    expect(find.text('Pendiente de envío'), findsNothing);
    expect(find.text('Vigente'), findsOneWidget, reason: 'ahora la trae el servidor');

    // Más vueltas no la reenvían, y el llavero ya no la guarda.
    await t.pump(const Duration(seconds: 20));
    await t.pumpAndSettle();
    expect(mundo.repo.llamadasPorClave, {clave: 1});
    expect(mundo.llavero.datos.keys.where((k) => k.contains(clave)), isEmpty);
  });

  testWidgets('LA RESPUESTA SE PERDIÓ: el segundo envío con la MISMA clave no duplica', (t) async {
    lienzoAlto(t);
    final mundo = Mundo()..repo.perderLaRespuesta = true;
    await abrir(t, mundo);

    // El servidor la crea, pero la respuesta no llega: la app no puede saberlo.
    await registrarDesdeElFormulario(t);
    expect(find.text('Quedó pendiente de enviarse'), findsOneWidget);
    await t.pageBack();
    await t.pumpAndSettle();

    mundo.reloj.avanzar(const Duration(minutes: 1));
    await t.pump(const Duration(seconds: 20));
    await t.pumpAndSettle();

    expect(mundo.repo.llamadasPorClave, {clave: 2}, reason: 'se envió dos veces…');
    expect(mundo.repo.creadas, hasLength(1), reason: '…y el conjunto tiene UNA');
    expect(find.text('Plomero Pérez'), findsOneWidget);
    expect(find.text('Pendiente de envío'), findsNothing);
  });
}
