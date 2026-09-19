import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/estado.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/presentacion/widgets/estados.dart';

/// Los cinco estados transversales, comprobados en el árbol de widgets.
///
/// El hallazgo más voluminoso de la auditoría de mockups era que ninguna de las
/// 18 pantallas los dibuja. Aquí se comprueba que cada uno produce un texto
/// distinto y que las acciones ofrecidas son las correctas — que es donde está
/// la diferencia entre un error y un mensaje útil: «reintentar» ante un fallo
/// de red, y **nada** que reintentar ante un «sin permiso», porque insistir no
/// lo arregla.
void main() {
  Widget montar(Estado<String> estado, {VoidCallback? alPedirAcceso}) => MaterialApp(
        home: Scaffold(
          body: VistaConEstado<String>(
            estado: estado,
            conDatos: (d, {required desdeCache}) => Text('datos: $d'),
            alReintentar: () async {},
            alPedirAcceso: alPedirAcceso ?? () {},
          ),
        ),
      );

  testWidgets('ConDatos pinta los datos', (t) async {
    await t.pumpWidget(montar(const ConDatos('hola')));
    expect(find.text('datos: hola'), findsOneWidget);
  });

  testWidgets('Vacio dice que está vacío, no que falló', (t) async {
    await t.pumpWidget(montar(const Vacio()));
    expect(find.text('Sin datos'), findsOneWidget);
    expect(find.text('Reintentar'), findsNothing);
  });

  testWidgets('sin conexión ofrece reintentar', (t) async {
    await t.pumpWidget(
      montar(const Fallido(Fallo(ClaseDeFallo.sinConexion, 'no hay red'))),
    );
    expect(find.text('Sin conexión'), findsOneWidget);
    expect(find.text('no hay red'), findsOneWidget);
    expect(find.text('Reintentar'), findsOneWidget);
  });

  testWidgets('sesión inválida lleva a entrar otra vez, no a reintentar', (t) async {
    var pidioAcceso = false;
    await t.pumpWidget(
      montar(
        const Fallido(Fallo(ClaseDeFallo.sesionInvalida, 'token vencido')),
        alPedirAcceso: () => pidioAcceso = true,
      ),
    );
    expect(find.text('La sesión expiró'), findsOneWidget);
    expect(find.text('Reintentar'), findsNothing);

    await t.tap(find.text('Entrar otra vez'));
    await t.pump();
    expect(pidioAcceso, isTrue);
  });

  testWidgets('sin permiso NO ofrece ninguna acción', (t) async {
    // Un botón que no arregla nada enseña a pulsarlo. Aquí solo hay motivo.
    await t.pumpWidget(
      montar(const Fallido(Fallo(ClaseDeFallo.sinPermiso, 'su cuenta no alcanza esto'))),
    );
    expect(find.text('Sin permiso'), findsOneWidget);
    expect(find.byType(FilledButton), findsNothing);
  });

  testWidgets('sin vivienda es un estado previsto, con su explicación', (t) async {
    await t.pumpWidget(
      montar(
        const Fallido(
          Fallo(ClaseDeFallo.sinVivienda, 'La identidad no tiene una vivienda activa asignada'),
        ),
      ),
    );
    expect(find.text('Sin vivienda asignada'), findsOneWidget);
    expect(find.textContaining('vivienda activa'), findsOneWidget);
  });

  testWidgets('recargar con dato previo NO vacía la pantalla', (t) async {
    // El parpadeo a blanco en cada regreso a primer plano, evitado.
    await t.pumpWidget(montar(const Cargando(previo: 'lo de antes')));
    expect(find.text('datos: lo de antes'), findsOneWidget);
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
  });

  testWidgets('un fallo con dato previo muestra los dos', (t) async {
    await t.pumpWidget(
      montar(
        const Fallido(
          Fallo(ClaseDeFallo.sinConexion, 'se cayó la red'),
          previo: 'lo de antes',
        ),
      ),
    );
    expect(find.text('Sin conexión'), findsOneWidget);
    expect(find.text('datos: lo de antes'), findsOneWidget);
  });
}
