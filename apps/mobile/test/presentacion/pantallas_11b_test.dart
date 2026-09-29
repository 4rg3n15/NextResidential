/// Las pantallas de 11-B, cada una por lo que puede salir mal. El formulario
/// de «Nuevo visitante» (15-L, F1) tiene su propio fichero: `visitas_test.dart`.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/bandeja_de_salida.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/notificaciones.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/presentacion/controlador.dart';
import 'package:ncr_residente/presentacion/pantallas/notificaciones.dart';
import 'package:ncr_residente/presentacion/pantallas/visitantes.dart';
import 'package:ncr_residente/presentacion/pantallas/zonas.dart';

import '../dobles/visitas.dart';
import 'pantallas_test.dart' show RepositorioFalso;

Widget envolver(Widget hijo) => MaterialApp(home: hijo);

final ahora = DateTime.utc(2026, 9, 20, 12);

ZonaComun zona({
  String nombre = 'Piscina',
  int aforo = 20,
  int ocupacion = 5,
  bool abierta = true,
  List<FranjaDeZona> franjas = const [],
}) =>
    ZonaComun(
      id: 'z1',
      nombre: nombre,
      aforoMaximo: aforo,
      ocupacionActual: ocupacion,
      abiertaAhora: abierta,
      franjasDeHoy: franjas,
      requiereAutorizacion: false,
    );

void main() {
  // ═══════════════════════════════════════════════════════════════════════════
  // M-5 · ZONAS
  // ═══════════════════════════════════════════════════════════════════════════

  group('M-5 · la interfaz REFLEJA, no calcula', () {
    Future<void> montar(WidgetTester t, List<ZonaComun> zonas) async {
      final repo = RepositorioFalso(zonas: zonas);
      final c = controladorDeZonas(repo);
      await c.cargarAhora();
      await t.pumpWidget(envolver(PantallaDeZonas(controlador: c, alPedirAcceso: () {})));
      await t.pumpAndSettle();
    }

    testWidgets('el aviso deja claro que NO reserva plaza', (t) async {
      // Sin esto, ver «quedan 15» y salir de casa es razonable — y al llegar
      // puede estar lleno, porque el aforo lo garantiza la base en el momento
      // del acceso, no el teléfono al mirarlo.
      await montar(t, [zona()]);
      expect(find.textContaining('No reserva plaza'), findsOneWidget);
    });

    testWidgets('con aforo lleno lo dice, y no enseña un número negativo', (t) async {
      await montar(t, [zona(aforo: 10, ocupacion: 13)]);
      expect(find.textContaining('-3'), findsNothing);
      expect(find.textContaining('Lleno'), findsWidgets);
    });

    testWidgets('EL HORARIO QUE CRUZA MEDIANOCHE se pinta entero', (t) async {
      /**
       * D-97 · ESTA PRUEBA AFIRMABA UN TEXTO QUE DEPENDÍA DE LA MÁQUINA.
       *
       * Construía la franja en UTC —`DateTime.utc(2026, 9, 21, 2)`— y exigía
       * leer «02:00». El widget pinta `toLocal()`, así que el texto sale en el
       * huso del sistema: en un contenedor con `TZ=Etc/UTC` da 02:00 y pasa, y
       * en Bogotá da 21:00 y falla. Mismo código, dos resultados.
       *
       * La ironía está en el nombre: la prueba de la franja que cruza
       * medianoche era justo la expuesta a que el huso la moviera de día.
       *
       * Ahora se construye en hora LOCAL —lo que el residente tiene delante— y
       * el texto esperado se deriva de la misma hora, no de una constante. Así
       * la afirmación es la misma en macOS, en Linux y en cualquier huso.
       */
      final desde = DateTime(2026, 9, 20, 20);
      final hasta = desde.add(const Duration(hours: 6));
      // Sin esto la prueba podría dejar de cruzar medianoche —un cambio de
      // horario de verano mueve la hora— y seguiría en verde sin probar nada.
      expect(hasta.day, isNot(desde.day), reason: 'la franja tiene que cruzar medianoche');

      await montar(t, [
        zona(nombre: 'Salón social', franjas: [FranjaDeZona(desde: desde, hasta: hasta)]),
      ]);

      String dosCifras(int n) => n.toString().padLeft(2, '0');
      final esperado = '${dosCifras(desde.hour)}:00–${dosCifras(hasta.hour)}:00';

      expect(find.text('Salón social'), findsOneWidget);
      // Y ENTERO: un solo texto con los dos extremos. Si la pantalla la
      // partiera en dos al llegar a medianoche, aquí habría dos entradas y el
      // residente leería un horario que no es el de la zona.
      expect(find.textContaining(esperado), findsOneWidget);
    });

    testWidgets('cerrada ahora se distingue de llena: son cosas distintas', (t) async {
      await montar(t, [zona(abierta: false, ocupacion: 0)]);
      expect(find.textContaining('Cerrada'), findsWidgets);
    });

    testWidgets('sin zonas, el vacío se explica en vez de dejar la pantalla en blanco', (t) async {
      await montar(t, const []);
      expect(find.textContaining('todavía no tiene zonas comunes'), findsOneWidget);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // M-7 · NOTIFICACIONES
  // ═══════════════════════════════════════════════════════════════════════════

  group('M-7 · las notificaciones de la API, sin prometer avisos (15-L)', () {
    Future<ControladorDeVista<List<Notificacion>>> montar(
      WidgetTester t,
      List<Notificacion> lista,
    ) async {
      final c = ControladorDeVista<List<Notificacion>>(
        leer: () async => lista,
        estaVacio: (l) => l.isEmpty,
      );
      await c.cargarAhora();
      await t.pumpWidget(envolver(PantallaDeNotificaciones(controlador: c, alPedirAcceso: () {})));
      await t.pumpAndSettle();
      return c;
    }

    testWidgets('dice que los avisos llegan con la app abierta, y ningún botón promete otra cosa',
        (t) async {
      await montar(t, const []);
      expect(find.textContaining(avisosConLaAppAbierta), findsOneWidget);
      expect(find.textContaining('Todavía no hay avisos'), findsOneWidget);
      // Ni «Activar», ni interruptor: sin servicio de mensajería no hay nada que
      // activar.
      expect(find.textContaining('Activar'), findsNothing);
      expect(find.byType(Switch), findsNothing);
    });

    testWidgets('la visita rechazada con su motivo, y el ingreso, con fecha y hora', (t) async {
      final en = DateTime(2026, 9, 20, 9, 5);
      await montar(t, [
        Notificacion(
          id: 'n-1',
          tipo: TipoDeNotificacion.visitaRechazada,
          en: en,
          visitante: 'Ana',
          motivo: 'El residente no la espera',
        ),
        Notificacion(
          id: 'n-2',
          tipo: TipoDeNotificacion.ingresoDeVisitante,
          en: en,
          visitante: 'Luis',
        ),
      ]);
      expect(find.text('Rechazaron la visita de Ana: El residente no la espera'), findsOneWidget);
      expect(find.text('Luis ingresó'), findsOneWidget);
      // C5 (15-M) · DD-MM-YYYY, con año: la única fecha corta de la app.
      expect(find.text('20-09-2026 · 09:05'), findsNWidgets(2));
    });

    testWidgets('tirar hacia abajo la vuelve a pedir', (t) async {
      var pedidas = 0;
      final c = ControladorDeVista<List<Notificacion>>(
        leer: () async {
          pedidas += 1;
          return const [];
        },
      );
      await c.cargarAhora();
      await t.pumpWidget(envolver(PantallaDeNotificaciones(controlador: c, alPedirAcceso: () {})));
      await t.pumpAndSettle();
      await t.fling(find.byType(ListView), const Offset(0, 400), 1000);
      await t.pumpAndSettle();
      expect(pedidas, 2);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LA PESTAÑA DE VISITANTES Y LA BANDEJA
  // ═══════════════════════════════════════════════════════════════════════════

  /// La pestaña montada con sus dos lecturas ya hechas.
  Future<List<VisitanteReciente>> montarPestana(
    WidgetTester t, {
    RepositorioFalso? repo,
    List<EnvioPendiente> pendientes = const [],
  }) async {
    final r = repo ?? RepositorioFalso();
    final c = controladorDeAutorizaciones(r);
    final u = controladorDeUltimosVisitantes(r);
    await c.cargarAhora();
    await u.cargarAhora();
    final pulsados = <VisitanteReciente>[];
    await t.pumpWidget(
      envolver(
        PantallaDeVisitantes(
          controlador: c,
          ultimos: u,
          alPedirAcceso: () {},
          alCrear: () {},
          alVolverAAutorizar: pulsados.add,
          alReintentarPendientes: () async {},
          pendientes: pendientes,
        ),
      ),
    );
    await t.pumpAndSettle();
    return pulsados;
  }

  testWidgets('LO PENDIENTE SE VE, y separado de lo confirmado', (t) async {
    // Si no se viera, el residente tendría una lista donde su visitante NO
    // aparece: creería que se perdió y lo volvería a crear, con clave nueva.
    await montarPestana(
      t,
      pendientes: [
        EnvioPendiente(
          claveDeIdempotencia: 'k1',
          recurso: 'mi/visitas',
          cuerpo: const {'visitante': 'Plomero'},
          encoladoEn: ahora.subtract(const Duration(minutes: 3)),
          intentos: 2,
          ultimoError: 'sin red',
        ),
      ],
    );

    expect(find.textContaining('1 sin enviar'), findsOneWidget);
    expect(find.textContaining('NO están autorizadas'), findsOneWidget);
    expect(find.textContaining('Plomero'), findsOneWidget);
    // Y el residente lee por qué reintentar es seguro.
    expect(find.textContaining('Reintentar no duplica'), findsOneWidget);
  });

  testWidgets('sin nada pendiente, la bandeja no ocupa sitio', (t) async {
    await montarPestana(t);
    expect(find.textContaining('sin enviar'), findsNothing);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // F6 · ÚLTIMOS VISITANTES
  // ═══════════════════════════════════════════════════════════════════════════

  testWidgets('F6 · cada visitante reciente lleva «Volver a autorizar» con SU visita', (t) async {
    t.view.physicalSize = const Size(1000, 2000);
    t.view.devicePixelRatio = 1.0;
    addTearDown(t.view.reset);
    final pulsados = await montarPestana(
      t,
      repo: RepositorioFalso(
        recientes: [
          recienteDePrueba(),
          recienteDePrueba(autorizacionId: 'aut-8', visitante: 'Sin Foto', tieneFoto: false),
        ],
      ),
    );

    expect(find.text('Últimos visitantes'), findsOneWidget);
    expect(find.text('Plomero Pérez'), findsOneWidget);
    // Sin foto guardada no hay nada que copiar: se dice ANTES de pulsar y el
    // botón no responde.
    expect(find.textContaining('No hay una foto guardada'), findsOneWidget);
    final botones = t.widgetList<TextButton>(
      find.ancestor(of: find.text('Volver a autorizar'), matching: find.byType(TextButton)),
    );
    expect(botones.map((b) => b.onPressed != null), [true, false]);

    await t.tap(find.text('Volver a autorizar').first);
    expect(pulsados.single.autorizacionId, 'aut-7');
  });

  testWidgets('F6 · sin autorizaciones todavía, los últimos visitantes siguen a la vista', (t) async {
    // Es justo cuando más se vuelve a autorizar: la visita de la semana pasada
    // ya terminó y hoy no hay nada vigente.
    await montarPestana(
      t,
      repo: RepositorioSinAutorizaciones(recientes: [recienteDePrueba()]),
    );
    expect(find.text('Todavía no ha autorizado a ningún visitante.'), findsOneWidget);
    expect(find.text('Volver a autorizar'), findsOneWidget);
  });

  testWidgets('F6 · sin visitantes recientes, la sección no ocupa sitio', (t) async {
    await montarPestana(t);
    expect(find.text('Últimos visitantes'), findsNothing);
  });

  testWidgets('F6 · si los últimos visitantes no cargan, se dice sin tapar lo autorizado',
      (t) async {
    await montarPestana(
      t,
      repo: RepositorioSinRecientes(const Fallo(ClaseDeFallo.sinConexion, 'sin red')),
    );
    expect(find.text('No se pudieron cargar sus últimos visitantes.'), findsOneWidget);
    expect(find.text('Visitante propio'), findsOneWidget, reason: 'lo autorizado sigue ahí');
  });
}

class RepositorioSinAutorizaciones extends RepositorioFalso {
  RepositorioSinAutorizaciones({super.recientes});
  @override
  Future<List<Autorizacion>> misAutorizaciones() async => const [];
}

class RepositorioSinRecientes extends RepositorioFalso {
  RepositorioSinRecientes(this.fallo);
  final Fallo fallo;
  @override
  Future<List<VisitanteReciente>> ultimosVisitantes() async => throw fallo;
}
