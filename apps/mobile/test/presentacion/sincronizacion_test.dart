/// 15-L · LA APP AL DÍA CON LA CONSOLA, SIN QUE EL RESIDENTE TOQUE NADA.
///
/// «La información de la app debe sincronizarse con la de la consola web,
/// porque ambas comparten información.» Estas pruebas montan la app ENTERA y
/// cambian lo que contesta el servidor como lo cambiaría portería desde la
/// consola. Luego sólo dejan pasar el tiempo, con el reloj falso del banco
/// (`pump(Duration)`): ni un toque, ni un gesto.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';

import '../dobles/app_de_prueba.dart';
import '../dobles/sincronizacion.dart';

Future<Mundo> abrirLaApp(WidgetTester t, {Mundo? mundo}) async {
  final m = mundo ?? Mundo();
  final (app, _, _) = await m.arrancar();
  await t.pumpWidget(app);
  await t.pumpAndSettle();
  return m;
}

/// Deja pasar `d` en el reloj del banco y lo que dispare.
Future<void> esperar(WidgetTester t, Duration d) async {
  await t.pump(d);
  await t.pumpAndSettle();
}

void main() {
  testWidgets('LA VISITA QUE PORTERÍA RECHAZA DESDE LA CONSOLA cambia sola en la app', (t) async {
    final mundo = Mundo();
    mundo.repo.autorizaciones = [
      visitaDelConjunto('aut-1', 'Ana Visitante', SituacionDeVisita.vigente),
    ];
    await abrirLaApp(t, mundo: mundo);
    await t.tap(find.text('Visitantes'));
    await t.pumpAndSettle();
    expect(find.text('Vigente'), findsOneWidget);

    // Portería la rechaza en la consola: la API ya contesta otra cosa.
    mundo.repo.autorizaciones = [
      visitaDelConjunto(
        'aut-1',
        'Ana Visitante',
        SituacionDeVisita.rechazada,
        motivo: 'El residente no la espera',
      ),
    ];

    await esperar(t, const Duration(seconds: 15));
    expect(find.text('Vigente'), findsOneWidget, reason: 'todavía no tocaba recargar');

    await esperar(t, const Duration(seconds: 5));
    expect(find.text('Rechazada'), findsOneWidget);
    expect(find.text('Motivo: El residente no la espera'), findsOneWidget);
    expect(find.text('Vigente'), findsNothing);
  });

  testWidgets('UNA NOTIFICACIÓN NUEVA sube sola el contador de Inicio; abrirla lo devuelve a cero',
      (t) async {
    final mundo = await abrirLaApp(t);
    expect(find.text('Nada nuevo'), findsOneWidget);

    mundo.notificaciones.lista = [rechazo('n-1', 'Ana', 'El residente no la espera')];
    await esperar(t, const Duration(seconds: 20));
    expect(find.text('1 sin ver'), findsOneWidget);
    // Y en la barra, para quien está en otra pestaña.
    expect(
      find.descendant(of: find.byType(NavigationBar), matching: find.text('1')),
      findsOneWidget,
    );

    mundo.notificaciones.lista = [rechazo('n-2', 'Luis', 'Sin cupo'), ...mundo.notificaciones.lista];
    await esperar(t, const Duration(seconds: 20));
    expect(find.text('2 sin ver'), findsOneWidget);

    await t.tap(find.byKey(const Key('inicio.notificaciones')));
    await t.pumpAndSettle();
    expect(find.text('Rechazaron la visita de Ana: El residente no la espera'), findsOneWidget);
    expect(find.text('Rechazaron la visita de Luis: Sin cupo'), findsOneWidget);

    // Lo que llega con la pantalla abierta se da por visto: la está leyendo.
    mundo.notificaciones.lista = [rechazo('n-3', 'Eva', 'Otra'), ...mundo.notificaciones.lista];
    await esperar(t, const Duration(seconds: 20));
    expect(find.text('Rechazaron la visita de Eva: Otra'), findsOneWidget);

    await t.pageBack();
    await t.pumpAndSettle();
    expect(find.text('Nada nuevo'), findsOneWidget);
  });

  testWidgets('en segundo plano se DETIENE; al volver a primer plano recarga EN EL ACTO',
      (t) async {
    final mundo = await abrirLaApp(t);
    final antes = mundo.repo.leidas('hogar');

    for (final e in [
      AppLifecycleState.inactive,
      AppLifecycleState.hidden,
      AppLifecycleState.paused,
    ]) {
      t.binding.handleAppLifecycleStateChanged(e);
    }
    await esperar(t, const Duration(minutes: 5));
    expect(mundo.repo.leidas('hogar'), antes, reason: 'en el bolsillo no se pregunta nada');

    for (final e in [
      AppLifecycleState.hidden,
      AppLifecycleState.inactive,
      AppLifecycleState.resumed,
    ]) {
      t.binding.handleAppLifecycleStateChanged(e);
    }
    await t.pumpAndSettle();
    expect(mundo.repo.leidas('hogar'), antes + 1, reason: 'sin esperar a la siguiente vuelta');

    // Y el ciclo sigue: 20 s después, otra.
    await esperar(t, const Duration(seconds: 20));
    expect(mundo.repo.leidas('hogar'), antes + 2);
  });

  testWidgets('al volver con el token por vencer: RENUEVA y DESPUÉS pide', (t) async {
    final mundo = await abrirLaApp(t);
    final antes = mundo.repo.leidas('hogar');
    // Cuatro minutos y medio: el token de cinco vence dentro del margen.
    mundo.reloj.avanzar(const Duration(minutes: 4, seconds: 30));
    await esperar(t, const Duration(seconds: 20));
    expect(mundo.autenticador.renovaciones, 1);
    expect(mundo.repo.leidas('hogar'), antes + 1);
  });

  testWidgets('SIN SERVIDOR se espacia: 20 s, luego 40 s; y el aviso ofrece las dos salidas',
      (t) async {
    final mundo = await abrirLaApp(t);
    mundo.repo.falla = const Fallo(ClaseDeFallo.sinConexion, 'No hay respuesta del servidor.');
    final antes = mundo.repo.leidas('hogar');

    await esperar(t, const Duration(seconds: 20));
    expect(mundo.repo.leidas('hogar'), antes + 1);
    expect(find.text('Sin conexión'), findsOneWidget);
    expect(find.text('Reintentar'), findsOneWidget);
    expect(find.text('Cambiar servidor'), findsOneWidget);

    await esperar(t, const Duration(seconds: 20));
    expect(mundo.repo.leidas('hogar'), antes + 1, reason: 'tras un fallo, la espera se dobla');
    await esperar(t, const Duration(seconds: 20));
    expect(mundo.repo.leidas('hogar'), antes + 2);
  });

  testWidgets('TIRAR HACIA ABAJO recarga en el acto, en Visitantes y en Zonas', (t) async {
    final mundo = Mundo();
    mundo.repo.zonas = const [
      ZonaComun(
        id: 'z',
        nombre: 'Piscina',
        aforoMaximo: 20,
        ocupacionActual: 3,
        abiertaAhora: true,
        franjasDeHoy: [],
        requiereAutorizacion: false,
      ),
    ];
    await abrirLaApp(t, mundo: mundo);

    await t.tap(find.text('Visitantes'));
    await t.pumpAndSettle();
    final visitas = mundo.repo.leidas('autorizaciones');
    await t.fling(find.text('Mis visitantes'), const Offset(0, 400), 1000);
    await t.pumpAndSettle();
    expect(mundo.repo.leidas('autorizaciones'), visitas + 1);

    await t.tap(find.text('Zonas'));
    await t.pumpAndSettle();
    final zonas = mundo.repo.leidas('zonas');
    await t.fling(find.text('Zonas comunes'), const Offset(0, 400), 1000);
    await t.pumpAndSettle();
    expect(mundo.repo.leidas('zonas'), zonas + 1);
  });

  testWidgets('lo que NO se ve no se pide: el ciclo recarga la pestaña visible', (t) async {
    final mundo = await abrirLaApp(t);
    final zonas = mundo.repo.leidas('zonas');
    final hogar = mundo.repo.leidas('hogar');
    await esperar(t, const Duration(seconds: 20));
    expect(mundo.repo.leidas('hogar'), hogar + 1);
    expect(mundo.repo.leidas('zonas'), zonas, reason: 'Zonas no está a la vista');
    // Las notificaciones sí, en toda vuelta: alimentan el contador.
    expect(mundo.notificaciones.lecturas, greaterThan(1));
  });
}
