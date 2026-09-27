/// 15-L · bloque F en la app: el formulario de «Nuevo visitante» con su foto y
/// su casilla (F1, F4) y «Volver a autorizar» (F6).
///
/// Lo que se prueba no es que pinte campos: es que la visita NO sale sin foto
/// que sirva ni sin la casilla, que lo que sale lleva exactamente lo que el
/// servidor espera —y nada de la vivienda—, y que cada desenlace se dice con
/// palabras y nunca con un código.
library;

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/presentacion/pantallas/nuevo_visitante.dart';
import 'package:ncr_residente/presentacion/pantallas/volver_a_autorizar.dart';
import 'package:ncr_residente/presentacion/widgets/foto_del_visitante.dart';

import '../dobles/visitas.dart';
import 'pantallas_test.dart' show RepositorioFalso;

/// El formulario es largo y el lienzo de prueba mide 800×600: el botón y el
/// desenlace quedarían sin construir. Se agranda el lienzo en vez de
/// desplazarse: lo que se juzga es QUÉ DICE cada desenlace.
void lienzoAlto(WidgetTester t) {
  t.view.physicalSize = const Size(1000, 3200);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
}

/// Un instante con segundos, para comprobar que el formulario los quita.
final ahora = DateTime(2026, 9, 20, 9, 30, 45);

Future<void> montar(
  WidgetTester t, {
  required EnviarVisita enviar,
  TomarFoto? tomarFoto,
  String clave = 'k-estable',
}) async {
  lienzoAlto(t);
  await t.pumpWidget(
    MaterialApp(
      home: PantallaDeNuevoVisitante(
        enviar: enviar,
        tomarFoto: tomarFoto ?? () async => fotoTomada(medidasBuenas),
        claveDeIdempotencia: clave,
        ahora: ahora,
      ),
    ),
  );
  await t.pumpAndSettle();
}

Future<void> escribirQuien(WidgetTester t) async {
  await t.enterText(find.byKey(const Key('visita.nombre')), '  Plomero Pérez ');
  await t.enterText(find.byKey(const Key('visita.documento')), ' 79000111 ');
  await t.pump();
}

Future<void> tomarLaFoto(WidgetTester t) async {
  await t.tap(find.text('Tomar la foto'));
  await t.pumpAndSettle();
}

Future<void> marcarLaCasilla(WidgetTester t) async {
  await t.tap(find.text(textoDeLaCasilla));
  await t.pump();
}

Future<void> completarYRegistrar(WidgetTester t) async {
  await escribirQuien(t);
  await tomarLaFoto(t);
  await marcarLaCasilla(t);
  await t.tap(find.byKey(const Key('visita.registrar')));
  await t.pumpAndSettle();
}

FilledButton botonRegistrar(WidgetTester t) =>
    t.widget<FilledButton>(find.byKey(const Key('visita.registrar')));

void main() {
  // ═══════════════════════════════════════════════════════════════════════════
  // F1 · EL FORMULARIO
  // ═══════════════════════════════════════════════════════════════════════════

  testWidgets('F1 · sin foto que sirva y sin la casilla, el botón no se habilita y dice qué falta',
      (t) async {
    var intentos = 0;
    await montar(
      t,
      enviar: (_) async {
        intentos += 1;
        return const EnvioEncolado();
      },
    );

    expect(botonRegistrar(t).onPressed, isNull);
    expect(find.textContaining('una foto que sirva'), findsOneWidget);
    expect(find.textContaining('marcar la casilla'), findsOneWidget);

    await escribirQuien(t);
    await tomarLaFoto(t);
    // Con foto y sin casilla, todavía no.
    expect(botonRegistrar(t).onPressed, isNull);
    expect(find.text('Falta: marcar la casilla.'), findsOneWidget);

    await marcarLaCasilla(t);
    expect(botonRegistrar(t).onPressed, isNotNull);
    expect(find.byKey(const Key('visita.faltantes')), findsNothing);

    // Y desmarcarla vuelve a cerrar la puerta.
    await marcarLaCasilla(t);
    expect(botonRegistrar(t).onPressed, isNull);
    expect(intentos, 0);
  });

  testWidgets('F4 · la casilla dice EXACTAMENTE el texto que guarda el servidor', (t) async {
    await montar(t, enviar: (_) async => const EnvioEncolado());
    expect(find.text('El visitante autorizó el uso de su foto para el ingreso'), findsOneWidget);
    expect(find.byType(Checkbox), findsOneWidget);
  });

  testWidgets('F1 · lo que se envía lleva inicio, duración, foto y casilla', (t) async {
    final enviadas = <NuevaVisita>[];
    await montar(
      t,
      enviar: (v) async {
        enviadas.add(v);
        return const EnvioEncolado();
      },
    );

    await escribirQuien(t);
    await t.enterText(find.byKey(const Key('visita.placa')), 'abc-123');
    await t.tap(find.byKey(const Key('visita.duracion')));
    await t.pumpAndSettle();
    await t.tap(find.text('4 horas').last);
    await t.pumpAndSettle();
    await tomarLaFoto(t);
    await marcarLaCasilla(t);
    await t.tap(find.byKey(const Key('visita.registrar')));
    await t.pumpAndSettle();

    final v = enviadas.single;
    expect(v.visitante, 'Plomero Pérez');
    expect(v.documento, '79000111');
    // El formulario se abre en «ahora», sin segundos.
    expect(v.inicio, DateTime(2026, 9, 20, 9, 30));
    expect(v.duracionMinutos, 240);
    expect(v.hasta, DateTime(2026, 9, 20, 13, 30));
    expect(v.placa, 'ABC123', reason: 'mayúsculas, sin guion');
    expect(v.foto.jpegBase64, base64Encode(bytesDeJpeg));
    expect(v.foto.medidas.rostrosDetectados, 1);
    expect(v.casillaMarcada, isTrue);
    expect(v.claveDeIdempotencia, 'k-estable');
    // La vivienda no está porque `NuevaVisita` no tiene dónde ponerla: el
    // servidor la deriva del vínculo (lo comprueba la prueba del adaptador).
  });

  testWidgets('F1 · una foto mala da todos sus consejos y no habilita el envío', (t) async {
    await montar(
      t,
      enviar: (_) async => const EnvioEncolado(),
      tomarFoto: () async => fotoTomada(medidasMalas),
    );
    await escribirQuien(t);
    await tomarLaFoto(t);
    await marcarLaCasilla(t);

    expect(find.text('Repita la foto: hay 4 cosas'), findsOneWidget);
    expect(botonRegistrar(t).onPressed, isNull);
    expect(find.textContaining('una foto que sirva'), findsOneWidget);
  });

  testWidgets('F1 · una placa de más de 8 caracteres no sale', (t) async {
    var intentos = 0;
    await montar(
      t,
      enviar: (_) async {
        intentos += 1;
        return const EnvioEncolado();
      },
    );
    await t.enterText(find.byKey(const Key('visita.placa')), 'ABC 123 4567');
    await completarYRegistrar(t);

    expect(intentos, 0);
    expect(find.text('Revise la placa: tiene más de 8 caracteres'), findsOneWidget);
  });

  // ─── Los desenlaces ────────────────────────────────────────────────────────

  testWidgets('F3 · creada: dice que está autorizada y en cuántos equipos quedó la foto',
      (t) async {
    await montar(
      t,
      enviar: (_) async => const EnvioResuelto(
        VisitaCreada(id: 'a-1', repetida: false, equipos: 3, sincronizadas: 2, fallidas: 1),
      ),
    );
    await completarYRegistrar(t);

    expect(find.text('Visita autorizada'), findsOneWidget);
    expect(find.textContaining('La foto quedó en 2 de 3 equipos.'), findsOneWidget);
    expect(find.textContaining('1 no la aceptó'), findsOneWidget);
  });

  testWidgets('F3 · un solo equipo se dice en singular, y sin equipos no promete nada',
      (t) async {
    await montar(
      t,
      enviar: (_) async => const EnvioResuelto(
        VisitaCreada(id: 'a-1', repetida: false, equipos: 1, sincronizadas: 1),
      ),
    );
    await completarYRegistrar(t);
    expect(find.textContaining('La foto quedó en 1 de 1 equipo.'), findsOneWidget);
  });

  testWidgets('F3 · sin equipos de rostros, lo dice en vez de decir que la foto quedó', (t) async {
    await montar(
      t,
      enviar: (_) async => const EnvioResuelto(
        VisitaCreada(id: 'a-1', repetida: false, avisoDeSincronizacion: 'Sin equipos activos.'),
      ),
    );
    await completarYRegistrar(t);
    expect(find.textContaining('ningún equipo del conjunto reconoce rostros'), findsOneWidget);
    expect(find.textContaining('Sin equipos activos.'), findsOneWidget);
    expect(find.textContaining('La foto quedó'), findsNothing);
  });

  testWidgets('FOTO RECHAZADA · razones en palabras, NUNCA el código', (t) async {
    await montar(
      t,
      enviar: (_) async => const EnvioResuelto(
        FotoRechazada(['NITIDEZ', 'ROSTROS_MULTIPLES', 'NITIDEZ', 'CODIGO_NUEVO']),
      ),
    );
    await completarYRegistrar(t);

    expect(find.text('El conjunto no aceptó la foto'), findsOneWidget);
    expect(find.textContaining('la foto está borrosa'), findsOneWidget);
    expect(find.textContaining('se ve más de un rostro'), findsOneWidget);
    expect(find.textContaining('no tiene la calidad que piden los equipos'), findsOneWidget);
    for (final codigo in ['NITIDEZ', 'ROSTROS_MULTIPLES', 'CODIGO_NUEVO']) {
      expect(find.textContaining(codigo), findsNothing, reason: codigo);
    }
    expect(find.text('Visita autorizada'), findsNothing);
  });

  group('los cuatro rechazos de negocio llegan como respuesta, no como error', () {
    Future<void> rechazo(WidgetTester t, MotivoDeRechazo motivo, String explicacion) async {
      await montar(
        t,
        enviar: (_) async =>
            EnvioResuelto(VisitaRechazada(motivo: motivo, explicacion: explicacion)),
      );
      await completarYRegistrar(t);
    }

    testWidgets('LISTA NEGRA · dice que no se pudo, sin pedirle que corrija nada', (t) async {
      await rechazo(
        t,
        MotivoDeRechazo.listaNegra,
        'Esta persona no puede ingresar al conjunto. Consulte con la administración.',
      );
      expect(find.text('No se pudo registrar'), findsOneWidget);
      expect(
        find.text('Esta persona no puede ingresar al conjunto. Consulte con la administración.'),
        findsOneWidget,
      );
      // Y NO le dice que corrija: no hay nada que corregir (RN-07).
      expect(find.text('Corrija un dato y vuelva a intentar'), findsNothing);
    });

    testWidgets('PLACA DUPLICADA · esa SÍ la resuelve él, y el título lo dice', (t) async {
      await rechazo(t, MotivoDeRechazo.placaDuplicada, 'Esa placa ya está activa.');
      expect(find.text('Corrija un dato y vuelva a intentar'), findsOneWidget);
      expect(find.text('No se pudo registrar'), findsNothing);
    });

    testWidgets('VIVIENDA INACTIVA · es de administración, no del formulario', (t) async {
      await rechazo(t, MotivoDeRechazo.viviendaInactiva, 'Su vivienda está inactiva.');
      expect(find.text('No se pudo registrar'), findsOneWidget);
    });

    testWidgets('SIN NIVEL DE ACCESO · tampoco es culpa del formulario', (t) async {
      await rechazo(t, MotivoDeRechazo.sinNivelDeAcceso, 'Su registro no permite autorizar.');
      expect(find.text('No se pudo registrar'), findsOneWidget);
    });
  });

  testWidgets('SIN RED no dice «autorizada», porque no lo está', (t) async {
    await montar(t, enviar: (_) async => const EnvioEncolado());
    await completarYRegistrar(t);

    expect(find.text('Quedó pendiente de enviarse'), findsOneWidget);
    expect(find.text('Visita autorizada'), findsNothing);
  });

  testWidgets('una visita repetida lo dice: el conjunto no creó otra (RN-17)', (t) async {
    await montar(
      t,
      enviar: (_) async => const EnvioResuelto(VisitaCreada(id: 'a-1', repetida: true)),
    );
    await completarYRegistrar(t);
    expect(find.text('Esta visita ya estaba registrada'), findsOneWidget);
  });

  testWidgets('un formulario que el servidor no admite se explica con SU motivo', (t) async {
    await montar(
      t,
      enviar: (_) async => throw const Fallo(
        ClaseDeFallo.datosNoValidos,
        'La duración debe estar entre 15 minutos y 24 horas',
      ),
    );
    await completarYRegistrar(t);
    expect(find.text('No se pudo enviar'), findsOneWidget);
    expect(find.text('La duración debe estar entre 15 minutos y 24 horas'), findsOneWidget);
    expect(find.text('Quedó pendiente de enviarse'), findsNothing);
  });

  testWidgets('LA CLAVE NO CAMBIA entre reconstrucciones ni entre intentos', (t) async {
    // Si la pantalla la fabricara, cada `setState` la cambiaría y el reintento
    // crearía una visita distinta en vez de recuperar la anterior.
    final claves = <String>[];
    await montar(
      t,
      enviar: (v) async {
        claves.add(v.claveDeIdempotencia);
        return const EnvioEncolado();
      },
    );
    await completarYRegistrar(t);
    for (var i = 0; i < 2; i++) {
      await t.tap(find.byKey(const Key('visita.registrar')));
      await t.pumpAndSettle();
    }
    expect(claves, ['k-estable', 'k-estable', 'k-estable']);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F6 · VOLVER A AUTORIZAR
  // ═══════════════════════════════════════════════════════════════════════════

  Future<RepositorioFalso> montarRepeticion(
    WidgetTester t, {
    RepositorioFalso? repo,
    VisitanteReciente? visitante,
  }) async {
    lienzoAlto(t);
    final r = repo ?? RepositorioFalso();
    await t.pumpWidget(
      MaterialApp(
        home: PantallaDeVolverAAutorizar(
          visitante: visitante ?? recienteDePrueba(),
          volverAAutorizar: r.volverAAutorizar,
          claveDeIdempotencia: 'k-repeticion',
          ahora: ahora,
        ),
      ),
    );
    await t.pumpAndSettle();
    return r;
  }

  testWidgets('F6 · pide SÓLO fecha, hora, duración y la casilla', (t) async {
    await montarRepeticion(t);

    // Nada que escribir, ninguna foto que tomar.
    expect(find.byType(TextField), findsNothing);
    expect(find.byType(FotoDelVisitante), findsNothing);
    expect(find.byKey(const Key('visita.fecha')), findsOneWidget);
    expect(find.byKey(const Key('visita.hora')), findsOneWidget);
    expect(find.byKey(const Key('visita.duracion')), findsOneWidget);
    expect(find.byType(Checkbox), findsOneWidget);
    // Y dice de quién se trata, para que no haya duda de a quién se autoriza.
    expect(find.text('Plomero Pérez'), findsOneWidget);
  });

  testWidgets('F6 · sin la casilla no sale; con ella, sale con la visita ANTERIOR y la clave',
      (t) async {
    final repo = await montarRepeticion(t);
    final boton = find.byKey(const Key('repeticion.autorizar'));
    expect(t.widget<FilledButton>(boton).onPressed, isNull);

    await t.tap(find.byKey(const Key('visita.duracion')));
    await t.pumpAndSettle();
    await t.tap(find.text('1 hora').last);
    await t.pumpAndSettle();
    await marcarLaCasilla(t);
    await t.tap(boton);
    await t.pumpAndSettle();

    final r = repo.repeticiones.single;
    expect(r.autorizacionId, 'aut-7');
    expect(r.inicio, DateTime(2026, 9, 20, 9, 30));
    expect(r.duracion, 60);
    expect(r.casilla, isTrue);
    expect(r.clave, 'k-repeticion');
    expect(find.text('Visita autorizada'), findsOneWidget);
  });

  testWidgets('F6 · una visita que no es de su vivienda se explica con el motivo', (t) async {
    await montarRepeticion(
      t,
      repo: RepositorioFalso(
        falloAlCrear: const Fallo(ClaseDeFallo.sinVivienda, 'Esa visita no es de su vivienda'),
      ),
    );
    await marcarLaCasilla(t);
    await t.tap(find.byKey(const Key('repeticion.autorizar')));
    await t.pumpAndSettle();

    expect(find.text('No se pudo enviar'), findsOneWidget);
    expect(find.text('Esa visita no es de su vivienda'), findsOneWidget);
  });

  testWidgets('F6 · un rechazo de negocio también es respuesta aquí', (t) async {
    await montarRepeticion(
      t,
      repo: RepositorioFalso(
        respuesta: const VisitaRechazada(
          motivo: MotivoDeRechazo.listaNegra,
          explicacion: 'Esta persona está en la lista negra del conjunto.',
        ),
      ),
    );
    await marcarLaCasilla(t);
    await t.tap(find.byKey(const Key('repeticion.autorizar')));
    await t.pumpAndSettle();
    expect(find.text('No se pudo registrar'), findsOneWidget);
  });
}
