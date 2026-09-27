/// F1 · la foto del visitante, dentro del formulario. Lo que se prueba es que
/// una foto que no sirve NUNCA sale del widget, y que el residente sabe por
/// qué repetirla.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/camara/camara_del_telefono.dart';
import 'package:ncr_residente/infraestructura/camara/fuente_de_fotos.dart';
import 'package:ncr_residente/presentacion/widgets/foto_del_visitante.dart';

import '../dobles/visitas.dart';

void main() {
  /// Monta el widget y devuelve lo que fue avisando hacia arriba.
  Future<List<FotoDeVisita?>> montar(WidgetTester t, TomarFoto tomarFoto) async {
    t.view.physicalSize = const Size(1000, 2000);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    final avisos = <FotoDeVisita?>[];
    await t.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(children: [FotoDelVisitante(tomarFoto: tomarFoto, alCambiar: avisos.add)]),
        ),
      ),
    );
    return avisos;
  }

  Future<void> tomar(WidgetTester t) async {
    await t.tap(find.byKey(const Key('foto.tomar')));
    await t.pumpAndSettle();
  }

  testWidgets('CA-08 · una foto mala da TODOS los consejos, no el primero', (t) async {
    final avisos = await montar(t, () async => fotoTomada(medidasMalas));
    await tomar(t);

    // Movida, oscura, dos personas y demasiado lejos: cuatro problemas, cuatro
    // consejos. De uno en uno serían cuatro viajes.
    expect(find.textContaining('quieto'), findsOneWidget);
    expect(find.textContaining('poca luz'), findsOneWidget);
    expect(find.textContaining('más de una persona'), findsOneWidget);
    expect(find.textContaining('Acérquese'), findsOneWidget);
    // Y hacia arriba no sale nada: el formulario no la puede enviar.
    expect(avisos, [null]);
  });

  testWidgets('una foto buena sale hacia el formulario con sus medidas', (t) async {
    final avisos = await montar(t, () async => fotoTomada(medidasBuenas));
    await tomar(t);

    expect(find.text('La foto sirve. Viajará con la visita.'), findsOneWidget);
    expect(find.text('Repetir la foto'), findsOneWidget);
    expect(avisos.single!.medidas.nitidez, medidasBuenas.nitidez);
  });

  testWidgets('cancelar la cámara no borra la foto que ya servía', (t) async {
    var primera = true;
    final avisos = await montar(t, () async {
      if (primera) {
        primera = false;
        return fotoTomada(medidasBuenas);
      }
      return null;
    });
    await tomar(t);
    await tomar(t);

    expect(avisos, hasLength(1), reason: 'el segundo intento no avisó nada');
    expect(find.text('La foto sirve. Viajará con la visita.'), findsOneWidget);
  });

  testWidgets('una cámara que no abre se dice, en vez de un botón que no hizo nada', (t) async {
    await montar(t, () async => throw Exception('permiso denegado'));
    await tomar(t);
    expect(find.textContaining('No se pudo abrir la cámara'), findsOneWidget);
  });

  testWidgets('cámara real sin detector: el encuadre se CONFIRMA, no se inventa', (t) async {
    final avisos = await montar(
      t,
      () async => fotoTomada(
        const MedidasDeCaptura(
          nitidez: 0.8,
          iluminacion: 0.5,
          rostrosDetectados: 0,
          proporcionRostro: 0,
        ),
        sinDetector: true,
      ),
    );
    await tomar(t);

    // Antes de confirmar: no sirve, y «no se ve ningún rostro» no aparece
    // como consejo porque nadie lo ha medido.
    expect(avisos, [null]);
    expect(find.textContaining('No se ve ningún rostro'), findsNothing);
    expect(find.byKey(const Key('foto.confirmarEncuadre')), findsOneWidget);

    await t.tap(find.byKey(const Key('foto.confirmarEncuadre')));
    await t.pumpAndSettle();

    // Lo que sale lleva el rostro y la proporción que la confirmación declara.
    final foto = avisos.last!;
    expect(foto.medidas.rostrosDetectados, 1);
    expect(foto.medidas.proporcionRostro, greaterThan(0));
    expect(find.byKey(const Key('foto.confirmarEncuadre')), findsNothing);
  });

  test('LA CÁMARA SIMULADA NO MIENTE: no siempre devuelve una foto buena', () async {
    // Una fuente que devolviera siempre una foto perfecta convertiría la
    // validación de calidad en adorno, y nadie vería jamás un consejo.
    final camara = CamaraSimulada(semilla: 7);
    var malas = 0;
    for (var i = 0; i < 40; i++) {
      final f = await camara.tomar();
      if (evaluarCaptura(f!.medidas).isNotEmpty) malas += 1;
    }
    expect(malas, greaterThan(0));
    expect(malas, lessThan(40), reason: 'y tampoco siempre mala: el flujo bueno se ejerce');
  });

  test('la simulada entrega un JPEG DE VERDAD: el servidor comprueba el tipo real', () async {
    final f = await CamaraSimulada(siempreBuena: true).tomar();
    expect(evaluarCaptura(f!.medidas), isEmpty);
    expect(esJpeg(f.jpeg), isTrue);
    expect(img.decodeJpg(f.jpeg), isNotNull);
  });
}
