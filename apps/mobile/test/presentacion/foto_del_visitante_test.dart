/// F1 · la foto del visitante, dentro del formulario. Lo que se prueba es que
/// una foto que no sirve NUNCA sale del widget, que el residente sabe por qué
/// repetirla, y que la galería es un segundo botón hacia el MISMO juicio: lo
/// que pasa con ella —elegir, cancelar, un archivo ilegible, un permiso
/// negado— se ve en pantalla y nunca revienta.
library;

import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/origen_de_la_foto.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/camara/camara_del_telefono.dart';
import 'package:ncr_residente/infraestructura/camara/fuente_de_fotos.dart';
import 'package:ncr_residente/presentacion/widgets/avisos_de_la_foto.dart';
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

  Future<void> elegir(WidgetTester t) async {
    await t.tap(find.byKey(const Key('foto.galeria')));
    await t.pumpAndSettle();
  }

  testWidgets('CA-08 · una foto mala da TODOS los consejos, no el primero', (t) async {
    final avisos = await montar(t, (_) async => fotoTomada(medidasMalas));
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
    final avisos = await montar(t, (_) async => fotoTomada(medidasBuenas));
    await tomar(t);

    expect(find.text('La foto sirve. Viajará con la visita.'), findsOneWidget);
    // Los dos botones siguen ahí, con el mismo texto: se busca otra, venga de
    // donde venga.
    expect(find.text('Tomar foto'), findsOneWidget);
    expect(find.text('Elegir de la galería'), findsOneWidget);
    expect(avisos.single!.medidas.nitidez, medidasBuenas.nitidez);
  });

  testWidgets('cancelar la cámara no borra la foto que ya servía', (t) async {
    var primera = true;
    final avisos = await montar(t, (_) async {
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
    await montar(t, (_) async => throw Exception('permiso denegado'));
    await tomar(t);
    expect(find.textContaining('No se pudo abrir la cámara'), findsOneWidget);
  });

  testWidgets('cámara real sin detector: el encuadre se CONFIRMA, no se inventa', (t) async {
    final avisos = await montar(
      t,
      (_) async => fotoTomada(
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

  // ═══════════════════════════════════════════════════════════════════════════
  // LA GALERÍA · decisión del cliente para la visita de sitio
  // ═══════════════════════════════════════════════════════════════════════════

  testWidgets('los dos orígenes están a la vista antes de tener foto', (t) async {
    await montar(t, (_) async => null);
    expect(find.text('Tomar foto'), findsOneWidget);
    expect(find.text('Elegir de la galería'), findsOneWidget);
    expect(find.byType(Image), findsNothing, reason: 'todavía no hay vista previa');
  });

  testWidgets('elegir de la galería pide ESE origen y llena la vista previa', (t) async {
    final pedidos = <OrigenDeFoto>[];
    final jpeg = Uint8List.fromList(img.encodeJpg(img.Image(width: 8, height: 8)));
    final avisos = await montar(t, (origen) async {
      pedidos.add(origen);
      return FotoTomada(jpeg: jpeg, medidas: medidasBuenas, vistaPrevia: jpeg);
    });
    await elegir(t);

    expect(pedidos, [OrigenDeFoto.galeria]);
    expect(find.byType(Image), findsOneWidget);
    expect(find.text('La foto sirve. Viajará con la visita.'), findsOneWidget);
    expect(avisos.single!.jpegBase64, isNotEmpty);
  });

  testWidgets('cancelar la galería deja todo vacío, sin aviso', (t) async {
    final avisos = await montar(t, (_) async => null);
    await elegir(t);

    expect(avisos, isEmpty, reason: 'cancelar no es un cambio');
    expect(find.byType(Image), findsNothing);
    expect(find.byKey(const Key('foto.aviso')), findsNothing);
  });

  testWidgets('un archivo ilegible se dice en palabras y la foto sigue vacía', (t) async {
    final avisos = await montar(
      t,
      (_) async => throw const FotoNoObtenida(MotivoSinFoto.ilegible),
    );
    await elegir(t);

    expect(find.textContaining('No se pudo leer esa imagen'), findsOneWidget);
    expect(avisos, isEmpty);
    expect(find.byType(Image), findsNothing);
    expect(find.text('La foto sirve. Viajará con la visita.'), findsNothing);
    // Y los botones vuelven a estar disponibles para intentarlo con otra.
    expect(t.widget<BotonDeLaFoto>(find.byKey(const Key('foto.galeria'))).alPulsar, isNotNull);
  });

  testWidgets('un permiso negado dice dónde activarlo', (t) async {
    await montar(t, (_) async => throw const FotoNoObtenida(MotivoSinFoto.sinPermiso));
    await elegir(t);
    expect(find.textContaining('permiso para ver sus fotos'), findsOneWidget);
    expect(find.textContaining('Ajustes del teléfono'), findsOneWidget);
  });

  testWidgets('una foto de la galería que no sirve da los MISMOS consejos', (t) async {
    final avisos = await montar(t, (_) async => fotoTomada(medidasMalas));
    await elegir(t);
    expect(find.text('Repita la foto: hay 4 cosas'), findsOneWidget);
    expect(avisos, [null]);
  });

  test('LA CÁMARA SIMULADA NO MIENTE: no siempre devuelve una foto buena', () async {
    // Una fuente que devolviera siempre una foto perfecta convertiría la
    // validación de calidad en adorno, y nadie vería jamás un consejo.
    final camara = CamaraSimulada(semilla: 7);
    var malas = 0;
    for (var i = 0; i < 40; i++) {
      final f = await camara.tomar(OrigenDeFoto.camara);
      if (evaluarCaptura(f!.medidas).isNotEmpty) malas += 1;
    }
    expect(malas, greaterThan(0));
    expect(malas, lessThan(40), reason: 'y tampoco siempre mala: el flujo bueno se ejerce');
  });

  test('la simulada entrega un JPEG DE VERDAD: el servidor comprueba el tipo real', () async {
    final f = await CamaraSimulada(siempreBuena: true).tomar(OrigenDeFoto.galeria);
    expect(evaluarCaptura(f!.medidas), isEmpty);
    expect(esJpeg(f.jpeg), isTrue);
    expect(img.decodeJpg(f.jpeg), isNotNull);
  });
}
