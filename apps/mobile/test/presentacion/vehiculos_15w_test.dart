/// RONDA 15-W · editar y eliminar un vehículo propio: la placa se edita, el
/// texto del servidor se ve si tiene historial, y al eliminar se dice si se
/// borró o si quedó dado de baja.
library;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/acceso.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/hogar.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/acciones_del_hogar.dart';
import 'package:ncr_residente/presentacion/controlador.dart';
import 'package:ncr_residente/presentacion/pantallas/vehiculos.dart';

import '../dobles/hogar_falso.dart';

const gris = Vehiculo(
  id: 'veh-1',
  placa: 'ABC123',
  marca: 'Kia',
  modelo: '2020',
  color: 'Gris',
  esPrincipal: true,
  activo: true,
);

class SinAcceso implements Autenticador {
  @override
  Future<Sesion> iniciarSesion(IdentificadorDeAcceso i, {required String clave}) =>
      throw const Fallo(ClaseDeFallo.sesionInvalida, 'no');
  @override
  Future<Sesion> renovar(Sesion sesion) async => sesion;
}

class RelojFijo implements Reloj {
  @override
  DateTime ahora() => DateTime.utc(2026, 10, 6, 15);
}

/// La pestaña de vehículos con las acciones de verdad sobre un hogar falso.
Future<ControladorDeVista<List<Vehiculo>>> montar(WidgetTester t, HogarFalso hogar) async {
  t.view.physicalSize = const Size(1000, 2000);
  t.view.devicePixelRatio = 1.0;
  addTearDown(t.view.reset);
  var lecturas = 0;
  final vehiculos = ControladorDeVista<List<Vehiculo>>(
    leer: () async {
      lecturas += 1;
      return lecturas == 1 || hogar.eliminados.isEmpty ? const [gris] : const <Vehiculo>[];
    },
  );
  await vehiculos.cargarAhora();
  final acciones = AccionesDelHogar(
    sesion: SesionEnUso(almacen: AlmacenEnMemoria(), autenticador: SinAcceso(), reloj: RelojFijo()),
    alta: AltaFalsa(),
    hogar: hogar,
    cuenta: CuentaFalsa(),
    familia: ControladorDeVista<List<MiembroDeFamilia>>(leer: () async => const [anaTitular]),
    vehiculos: vehiculos,
    perfil: ControladorDeVista<PerfilDelResidente>(leer: hogar.miPerfil),
    alCambiarDeVivienda: () {},
  );
  await t.pumpWidget(
    MaterialApp(
      home: Builder(
        builder: (contexto) => Scaffold(
          body: PantallaDeVehiculos(
            controlador: vehiculos,
            alPedirAcceso: () {},
            alRegistrar: () => acciones.registrarVehiculo(contexto),
            alEditar: (v) => acciones.editarVehiculo(contexto, v),
            alEliminar: (v) => acciones.eliminarVehiculo(contexto, v),
          ),
        ),
      ),
    ),
  );
  await t.pumpAndSettle();
  return vehiculos;
}

void main() {
  testWidgets('«Editar» trae los datos; sólo viaja la placa si cambió', (t) async {
    final hogar = HogarFalso();
    await montar(t, hogar);
    await t.tap(find.byKey(const Key('vehiculos.editar.ABC123')));
    await t.pumpAndSettle();
    expect(find.text('Editar vehículo'), findsOneWidget);
    expect(find.byKey(const Key('vehiculo.tipo')), findsNothing, reason: 'el tipo no se edita');
    expect(find.text('ABC123'), findsOneWidget);
    await t.enterText(find.byKey(const Key('vehiculo.color')), 'Rojo');
    await t.tap(find.byKey(const Key('vehiculo.registrar')));
    await t.pumpAndSettle();
    final (id, cambios) = hogar.ediciones.single;
    expect(
      (id, cambios.color, cambios.modelo, cambios.marca, cambios.placa),
      ('veh-1', 'Rojo', '2020', 'Kia', null),
    );
    expect(find.text('Vehículo ABC123 actualizado.'), findsOneWidget);
  });

  testWidgets('la placa se edita; con historial, el servidor dice qué hacer y se ve tal cual', (
    t,
  ) async {
    final hogar = HogarFalso()
      ..falloAlEditar = const Fallo(
        ClaseDeFallo.servidor,
        'Dé de baja este vehículo y registre el nuevo',
      );
    await montar(t, hogar);
    await t.tap(find.byKey(const Key('vehiculos.editar.ABC123')));
    await t.pumpAndSettle();
    await t.enterText(find.byKey(const Key('vehiculo.placa')), 'xyz-987');
    await t.tap(find.byKey(const Key('vehiculo.registrar')));
    await t.pumpAndSettle();
    expect(hogar.ediciones.single.$2.placa, 'xyz-987');
    expect(find.text('Dé de baja este vehículo y registre el nuevo'), findsOneWidget);
    expect(find.text('Editar vehículo'), findsOneWidget, reason: 'sigue en el formulario');
  });

  testWidgets('«Eliminar» pide confirmación y dice que se borró', (t) async {
    final hogar = HogarFalso();
    await montar(t, hogar);
    await t.tap(find.byKey(const Key('vehiculos.eliminar.ABC123')));
    await t.pumpAndSettle();
    await t.tap(find.text('Cancelar'));
    await t.pumpAndSettle();
    expect(hogar.eliminados, isEmpty, reason: 'cancelar no elimina');

    await t.tap(find.byKey(const Key('vehiculos.eliminar.ABC123')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('vehiculos.confirmarEliminar')));
    await t.pumpAndSettle();
    expect(hogar.eliminados, ['veh-1']);
    expect(find.text('Vehículo ABC123 eliminado.'), findsOneWidget);
  });

  testWidgets('«Eliminar» con historial: se dice que quedó dado de baja', (t) async {
    final hogar = HogarFalso(eliminacion: EliminacionDeVehiculo.dadoDeBaja);
    await montar(t, hogar);
    await t.tap(find.byKey(const Key('vehiculos.eliminar.ABC123')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('vehiculos.confirmarEliminar')));
    await t.pumpAndSettle();
    expect(find.textContaining('quedó dado de baja y su historial se conserva'), findsOneWidget);
  });
}
