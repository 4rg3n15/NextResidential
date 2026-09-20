/// Las tres pantallas de 11-B, cada una por lo que puede salir mal.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/dominio/bandeja_de_salida.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/presentacion/controlador.dart';
import 'package:ncr_residente/presentacion/pantallas/notificaciones.dart';
import 'package:ncr_residente/presentacion/pantallas/nuevo_visitante.dart';
import 'package:ncr_residente/presentacion/pantallas/visitantes.dart';
import 'package:ncr_residente/presentacion/pantallas/zonas.dart';

import 'pantallas_test.dart' show RepositorioFalso;

Widget envolver(Widget hijo) => MaterialApp(home: hijo);

/// El formulario de M-4 es largo y el lienzo de prueba mide 800×600: ni el
/// botón ni el recuadro del desenlace —que va ARRIBA del todo— caben a la vez.
/// Un `ListView` no construye lo que no se ve, así que desplazarse hasta el
/// botón deja el desenlace sin construir y la aserción buscaría algo que no
/// existe todavía.
///
/// Se agranda el lienzo en vez de desplazarse. Lo que estas pruebas juzgan es
/// QUÉ DICE cada desenlace, no que quepa en una pantalla de 600 px: eso es
/// asunto del recorrido web, que corre contra un navegador de verdad.
void lienzoAlto(WidgetTester t) {
  t.view.physicalSize = const Size(1000, 3000);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
}

Future<void> pulsarRegistrar(WidgetTester t) async {
  await t.tap(find.text('Registrar visita'));
  await t.pumpAndSettle();
}

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
  // M-4 · NUEVO VISITANTE
  // ═══════════════════════════════════════════════════════════════════════════

  group('M-4 · los cuatro rechazos llegan como respuesta, no como error', () {
    Future<void> montarYEnviar(WidgetTester t, ResultadoDeEnvio resultado) async {
      lienzoAlto(t);
      await t.pumpWidget(
        envolver(
          PantallaDeNuevoVisitante(
            enviar: (_) async => resultado,
            zonas: const [],
            claveDeIdempotencia: 'k1',
          ),
        ),
      );
      await t.enterText(find.byType(TextFormField).first, 'Visitante de prueba');
      await pulsarRegistrar(t);
    }

    testWidgets('LISTA NEGRA · dice que no se pudo, sin pedirle que corrija nada', (t) async {
      await montarYEnviar(
        t,
        const EnvioRechazado(
          VisitaRechazada(
            motivo: MotivoDeRechazo.listaNegra,
            explicacion: 'Esta persona no puede ingresar al conjunto. Consulte con la administración.',
          ),
        ),
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
      // Es la distinción que el usuario pidió por escrito: el residente debe
      // poder separar «llame a la administración» de «esto lo arreglo yo».
      await montarYEnviar(
        t,
        const EnvioRechazado(
          VisitaRechazada(
            motivo: MotivoDeRechazo.placaDuplicada,
            explicacion: 'Esa placa ya está autorizada y activa en el conjunto.',
          ),
        ),
      );
      expect(find.text('Corrija un dato y vuelva a intentar'), findsOneWidget);
      expect(find.text('No se pudo registrar'), findsNothing);
    });

    testWidgets('VIVIENDA INACTIVA · es de administración, no del formulario', (t) async {
      await montarYEnviar(
        t,
        const EnvioRechazado(
          VisitaRechazada(
            motivo: MotivoDeRechazo.viviendaInactiva,
            explicacion: 'Su vivienda está inactiva. Las visitas vigentes se conservan.',
          ),
        ),
      );
      expect(find.text('No se pudo registrar'), findsOneWidget);
    });

    testWidgets('SIN NIVEL DE ACCESO · tampoco es culpa del formulario', (t) async {
      await montarYEnviar(
        t,
        const EnvioRechazado(
          VisitaRechazada(
            motivo: MotivoDeRechazo.sinNivelDeAcceso,
            explicacion: 'Su registro no permite autorizar visitantes.',
          ),
        ),
      );
      expect(find.text('No se pudo registrar'), findsOneWidget);
    });
  });

  testWidgets('M-4 · SIN RED no dice «creada», porque no lo está', (t) async {
    lienzoAlto(t);
    // Prometerlo haría que el residente mandara a su visitante a una puerta
    // que no se va a abrir.
    await t.pumpWidget(
      envolver(
        PantallaDeNuevoVisitante(
          enviar: (_) async => const EnvioEncolado(),
          zonas: const [],
          claveDeIdempotencia: 'k1',
        ),
      ),
    );
    await t.enterText(find.byType(TextFormField).first, 'Visitante de prueba');
    await pulsarRegistrar(t);

    expect(find.text('Quedó pendiente de enviarse'), findsOneWidget);
    expect(find.textContaining('registrada', findRichText: true), findsNothing);
  });

  testWidgets('M-4 · una visita repetida lo dice: el conjunto no creó otra (RN-17)', (t) async {
    lienzoAlto(t);
    await t.pumpWidget(
      envolver(
        PantallaDeNuevoVisitante(
          enviar: (_) async => const EnvioAceptado(repetida: true),
          zonas: const [],
          claveDeIdempotencia: 'k1',
        ),
      ),
    );
    await t.enterText(find.byType(TextFormField).first, 'Visitante de prueba');
    await pulsarRegistrar(t);

    expect(find.text('Esta visita ya estaba registrada'), findsOneWidget);
  });

  testWidgets('M-4 · LA CLAVE NO CAMBIA entre reconstrucciones', (t) async {
    lienzoAlto(t);
    // Si la pantalla la fabricara, cada `setState` la cambiaría y el reintento
    // crearía una visita distinta en vez de recuperar la anterior.
    final claves = <String>[];
    await t.pumpWidget(
      envolver(
        PantallaDeNuevoVisitante(
          enviar: (v) async {
            claves.add(v.claveDeIdempotencia);
            return const EnvioEncolado();
          },
          zonas: const [],
          claveDeIdempotencia: 'k-estable',
        ),
      ),
    );
    await t.enterText(find.byType(TextFormField).first, 'Visitante de prueba');
    for (var i = 0; i < 3; i++) {
      await pulsarRegistrar(t);
    }
    expect(claves, ['k-estable', 'k-estable', 'k-estable']);
  });

  testWidgets('M-4 · el nombre es obligatorio y el envío no sale sin él', (t) async {
    lienzoAlto(t);
    var intentos = 0;
    await t.pumpWidget(
      envolver(
        PantallaDeNuevoVisitante(
          enviar: (_) async {
            intentos += 1;
            return const EnvioAceptado(repetida: false);
          },
          zonas: const [],
          claveDeIdempotencia: 'k1',
        ),
      ),
    );
    await pulsarRegistrar(t);

    expect(intentos, 0);
    expect(find.text('Escriba el nombre del visitante'), findsOneWidget);
  });

  testWidgets('M-4 · recurrente sin días elegidos no se envía a medias', (t) async {
    lienzoAlto(t);
    var intentos = 0;
    await t.pumpWidget(
      envolver(
        PantallaDeNuevoVisitante(
          enviar: (_) async {
            intentos += 1;
            return const EnvioAceptado(repetida: false);
          },
          zonas: const [],
          claveDeIdempotencia: 'k1',
        ),
      ),
    );
    await t.enterText(find.byType(TextFormField).first, 'Visitante de prueba');
    await t.tap(find.text('Se repite'));
    await t.pumpAndSettle();
    await pulsarRegistrar(t);

    expect(intentos, 0, reason: 'un patrón sin días no es un patrón');
  });

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

  group('M-7 · los cinco estados se pintan distinto', () {
    Future<void> montar(WidgetTester t, EstadoDeAvisos e) async {
      await t.pumpWidget(
        envolver(
          PantallaDeNotificaciones(
            estado: e,
            alActivar: () async {},
            alReintentar: () async {},
          ),
        ),
      );
      await t.pumpAndSettle();
    }

    testWidgets('sinToken NO se presenta como «activadas»', (t) async {
      await montar(t, EstadoDeAvisos.sinToken);
      expect(find.text('El servicio de avisos no respondió'), findsOneWidget);
      // La única forma de equivocarse aquí es dejar al residente creyendo que
      // le avisarán cuando llegue su visitante.
      expect(find.textContaining('le avisará'), findsNothing);
    });

    testWidgets('EL MÁS ENGAÑOSO · el teléfono listo y el conjunto sin apuntarlo', (t) async {
      // Permiso concedido, token en mano, y los avisos NO llegan. Un
      // interruptor lo pintaría encendido.
      await montar(t, EstadoDeAvisos.sinRegistrar);
      expect(find.textContaining('NO llegarán a este aparato'), findsOneWidget);
    });

    testWidgets('permisoNegado se distingue de sinRegistrar', (t) async {
      await montar(t, EstadoDeAvisos.permisoNegado);
      final negado = t.widgetList<Text>(find.byType(Text)).map((w) => w.data ?? '').join(' ');
      await montar(t, EstadoDeAvisos.sinRegistrar);
      final sinRegistrar = t.widgetList<Text>(find.byType(Text)).map((w) => w.data ?? '').join(' ');
      expect(negado, isNot(sinRegistrar));
    });

    testWidgets('registrado es el único que dice que sí llegarán', (t) async {
      await montar(t, EstadoDeAvisos.registrado);
      expect(find.textContaining('le avisará'), findsOneWidget);
    });

    testWidgets('los cinco se montan sin reventar', (t) async {
      for (final e in EstadoDeAvisos.values) {
        await montar(t, e);
        expect(find.byType(Scaffold), findsOneWidget, reason: '\$e');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // LA PESTAÑA DE VISITANTES Y LA BANDEJA
  // ═══════════════════════════════════════════════════════════════════════════

  testWidgets('LO PENDIENTE SE VE, y separado de lo confirmado', (t) async {
    // Si no se viera, el residente tendría una lista donde su visitante NO
    // aparece: creería que se perdió y lo volvería a crear, con clave nueva.
    final repo = RepositorioFalso();
    final c = controladorDeAutorizaciones(repo);
    await c.cargarAhora();

    await t.pumpWidget(
      envolver(
        PantallaDeVisitantes(
          controlador: c,
          alPedirAcceso: () {},
          alCrear: () {},
          ahora: ahora,
          alReintentarPendientes: () async {},
          pendientes: [
            EnvioPendiente(
              claveDeIdempotencia: 'k1',
              recurso: 'mi/autorizaciones',
              cuerpo: const {'visitante': 'Plomero'},
              encoladoEn: ahora.subtract(const Duration(minutes: 3)),
              intentos: 2,
              ultimoError: 'sin red',
            ),
          ],
        ),
      ),
    );
    await t.pumpAndSettle();

    expect(find.textContaining('1 sin enviar'), findsOneWidget);
    expect(find.textContaining('NO están autorizadas'), findsOneWidget);
    expect(find.textContaining('Plomero'), findsOneWidget);
    // Y el residente lee por qué reintentar es seguro.
    expect(find.textContaining('Reintentar no duplica'), findsOneWidget);
  });

  testWidgets('sin nada pendiente, la bandeja no ocupa sitio', (t) async {
    final repo = RepositorioFalso();
    final c = controladorDeAutorizaciones(repo);
    await c.cargarAhora();

    await t.pumpWidget(
      envolver(
        PantallaDeVisitantes(
          controlador: c,
          alPedirAcceso: () {},
          alCrear: () {},
          ahora: ahora,
          alReintentarPendientes: () async {},
          pendientes: const [],
        ),
      ),
    );
    await t.pumpAndSettle();
    expect(find.textContaining('sin enviar'), findsNothing);
  });
}
