/// 15-L · «EN SITIO LA APP DEBE FUNCIONAR IGUAL QUE EN CASA».
///
/// La dirección del servidor se ve y se cambia desde el acceso y desde toda
/// pantalla de error de conexión; se PRUEBA contra `/health` antes de
/// guardarla; sobrevive a cerrar la app; y cambiarla cierra la sesión.
library;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/servidor_en_uso.dart';
import 'package:ncr_residente/dominio/direccion_del_servidor.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/infraestructura/api/soporte_de_api.dart';
import 'package:ncr_residente/presentacion/pantallas/servidor.dart';

import '../dobles/app_de_prueba.dart';

const casa = 'http://mac-de-argenis.local:3000';
const sitio = 'http://oficina.local:3000';

Future<void> abrirServidorDesdeElAcceso(WidgetTester t) async {
  await t.tap(find.byKey(const Key('acceso.servidor')));
  await t.pumpAndSettle();
}

Future<void> probar(WidgetTester t, String direccion) async {
  await t.enterText(find.byKey(const Key('servidor.direccion')), direccion);
  await t.tap(find.byKey(const Key('servidor.probar')));
  await t.pumpAndSettle();
}

void main() {
  testWidgets('el acceso enseña «Servidor» con la dirección en uso', (t) async {
    final (app, _, _) = await Mundo(compilada: casa).arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    expect(find.text('Acceso del residente'), findsOneWidget);
    expect(find.text('Servidor'), findsOneWidget);
    expect(find.text(casa), findsOneWidget);
  });

  testWidgets('UNA DIRECCIÓN CUYO /health NO CONTESTA COMO NEXT CONTROL SE RECHAZA', (t) async {
    final mundo = Mundo(compilada: casa);
    mundo.comprobador.salud = SaludDelServidor.noEsNextControl;
    final (app, _, direccion) = await mundo.arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    await abrirServidorDesdeElAcceso(t);
    await probar(t, sitio);

    expect(mundo.comprobador.probadas, [sitio], reason: 'se probó');
    expect(find.textContaining('no es un servidor de Next Control'), findsOneWidget);
    expect(find.byType(PantallaDelServidor), findsOneWidget, reason: 'y no se fue a ninguna parte');
    expect(direccion.actual, casa, reason: 'ni se guardó');
    expect(mundo.llavero.datos.containsKey(DireccionDelServidor.clave), isFalse);

    // Cada causa, con su frase: la que no contesta dice qué revisar.
    mundo.comprobador.salud = SaludDelServidor.sinRespuesta;
    await probar(t, sitio);
    expect(
      find.text('No hay respuesta en esa dirección: revise que el Mac esté encendido y en la misma red.'),
      findsOneWidget,
    );
  });

  testWidgets('lo que la regla no admite se dice sin llegar a probarlo', (t) async {
    final mundo = Mundo(compilada: casa);
    final (app, _, _) = await mundo.arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    await abrirServidorDesdeElAcceso(t);
    await probar(t, 'http://203.0.113.7:3000');
    expect(find.textContaining('Para cualquier otra dirección use https://'), findsOneWidget);
    expect(mundo.comprobador.probadas, isEmpty);
  });

  testWidgets('LA DIRECCIÓN SOBREVIVE A CERRAR Y VOLVER A ABRIR LA APP', (t) async {
    final mundo = Mundo(compilada: casa);
    var (app, _, _) = await mundo.arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    await abrirServidorDesdeElAcceso(t);
    await probar(t, '  http://Oficina.local:3000/ ');
    expect(find.text('El servidor responde. Dirección guardada.'), findsOneWidget);
    expect(find.text('Acceso del residente'), findsOneWidget);
    expect(find.text(sitio), findsOneWidget, reason: 'guardada normalizada');

    // Se cierra la app (se desmonta TODO) y se vuelve a abrir con el mismo
    // llavero: lo que haría `main` al arrancar.
    await t.pumpWidget(const SizedBox());
    final DireccionDelServidor direccion;
    (app, _, direccion) = await mundo.arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    expect(direccion.actual, sitio, reason: 'la guardada gana a la compilada');
    expect(find.text(sitio), findsOneWidget);
    // Y los `Dio` que `main` ata a la dirección salen ya hacia ella.
    final dio = Dio();
    seguirLaDireccion(direccion, [dio]);
    expect(dio.options.baseUrl, sitio);

    // «Volver a la dirección de instalación» también está a mano.
    await abrirServidorDesdeElAcceso(t);
    await t.tap(find.text('Volver a la dirección de instalación'));
    await t.pumpAndSettle();
    expect(direccion.actual, casa);
    expect(find.text(casa), findsOneWidget);
  });

  testWidgets('DESDE LA PANTALLA DE ERROR: «Cambiar servidor» está ahí, y cambiarlo CIERRA LA SESIÓN',
      (t) async {
    final mundo = Mundo(compilada: casa);
    mundo.repo.falla = const Fallo(ClaseDeFallo.sinConexion, 'No hay respuesta del servidor.');
    final (app, sesion, direccion) = await mundo.arrancar();
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    expect(find.text('Sin conexión'), findsOneWidget);
    expect(find.text('Reintentar'), findsOneWidget);
    await t.tap(find.text('Cambiar servidor'));
    await t.pumpAndSettle();
    expect(find.byType(PantallaDelServidor), findsOneWidget);
    expect(find.textContaining('cierra la sesión'), findsOneWidget, reason: 'se dice ANTES');

    await probar(t, sitio);

    expect(direccion.actual, sitio);
    expect(sesion.haySesion, isFalse, reason: 'la sesión era del servidor anterior');
    expect(find.byType(PantallaDelServidor), findsNothing);
    expect(find.text('Acceso del residente'), findsOneWidget);
    expect(find.textContaining('entre otra vez con su usuario'), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing, reason: 'nada del servidor anterior a la vista');
  });

  testWidgets('el acceso sin red ofrece «Reintentar» y «Cambiar servidor» en el mismo recuadro',
      (t) async {
    final mundo = Mundo(compilada: casa);
    mundo.autenticador.falloAlEntrar = const Fallo(
      ClaseDeFallo.sinConexion,
      'El nombre del servidor no se encuentra en esta red.',
    );
    final (app, _, _) = await mundo.arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    await t.enterText(find.byKey(const Key('acceso.usuario')), 'ana@ejemplo.invalid');
    await t.enterText(find.byKey(const Key('acceso.clave')), 'Clave#2026');
    await t.tap(find.text('Entrar'));
    await t.pumpAndSettle();
    expect(find.text('El nombre del servidor no se encuentra en esta red.'), findsOneWidget);
    expect(find.text('Cambiar servidor'), findsOneWidget);

    // Vuelve la red: «Reintentar» entra sin volver a escribir nada.
    mundo.autenticador.falloAlEntrar = null;
    await t.tap(find.text('Reintentar'));
    await t.pumpAndSettle();
    expect(find.byType(NavigationBar), findsOneWidget);
  });

  testWidgets('la puerta del primer ingreso sin red también ofrece «Cambiar servidor»', (t) async {
    final mundo = Mundo(compilada: casa);
    mundo.alta.falloConsulta = const Fallo(ClaseDeFallo.sinConexion, 'No hay respuesta.');
    final (app, _, _) = await mundo.arrancar(conSesion: false);
    await t.pumpWidget(app);
    await t.pumpAndSettle();

    await t.enterText(find.byKey(const Key('acceso.usuario')), 'ana@ejemplo.invalid');
    await t.enterText(find.byKey(const Key('acceso.clave')), 'Clave#2026');
    await t.tap(find.text('Entrar'));
    await t.pumpAndSettle();
    expect(find.text('No hay respuesta.'), findsOneWidget);
    expect(find.text('Reintentar'), findsOneWidget);
    expect(find.text('Cambiar servidor'), findsOneWidget);
  });
}
