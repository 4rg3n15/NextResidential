import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ncr_residente/aplicacion/sesion_en_uso.dart';
import 'package:ncr_residente/dominio/calidad_de_captura.dart';
import 'package:ncr_residente/dominio/entidades.dart';
import 'package:ncr_residente/dominio/puertos.dart';
import 'package:ncr_residente/dominio/sesion.dart';
import 'package:ncr_residente/infraestructura/sesion/almacen_seguro.dart';
import 'package:ncr_residente/presentacion/controlador.dart';
import 'package:ncr_residente/presentacion/pantallas/familia.dart';
import 'package:ncr_residente/presentacion/pantallas/historial.dart';
import 'package:ncr_residente/presentacion/pantallas/inicio.dart';
import 'package:ncr_residente/presentacion/pantallas/notificaciones.dart';
import 'package:ncr_residente/presentacion/pantallas/pendiente.dart';
import 'package:ncr_residente/presentacion/pantallas/perfil.dart';
import 'package:ncr_residente/presentacion/pantallas/vehiculos.dart';

/// Las cinco pantallas de 11-A, recorridas como las ve el residente.
///
/// No comprueban «que pinte algo»: comprueban las decisiones que se tomaron
/// sobre el mockup —el botón que el servidor deshabilita, el residente
/// desactivado que sigue apareciendo, el motivo de la negación, el interruptor
/// que no se puede mover— porque son justo las que una revisión visual deja
/// pasar.
class RepositorioFalso implements RepositorioDelResidente {
  RepositorioFalso({
    this.puedeAutorizar = true,
    this.activa = true,
    this.zonas = const [],
    this.respuesta,
    this.falloAlCrear,
  });
  final bool puedeAutorizar;
  final bool activa;
  final List<ZonaComun> zonas;

  /// Qué contesta el conjunto al crear. `null` = aceptada.
  final ResultadoDeVisita? respuesta;

  /// Un fallo de TRANSPORTE, que es cosa distinta de un rechazo de negocio.
  final Fallo? falloAlCrear;

  final List<NuevaVisita> creadas = [];
  final List<AparatoDeNotificaciones> aparatos = [];

  @override
  Future<MiHogar> miHogar() async => MiHogar(
        vivienda: Vivienda(
          id: 'v',
          identificador: '42',
          agrupacion: 'B',
          etiquetaVivienda: 'Casa',
          etiquetaAgrupacion: 'Manzana',
          direccion: 'Calle inventada 00',
          copropiedadNombre: 'Conjunto de prueba',
          estadoAdministrativo: 'al_dia',
          activa: activa,
        ),
        vinculo: const Vinculo(
          residenteId: 'r',
          esTitular: true,
          nivelAcceso: 'acceso_completo',
        ),
        puedeAutorizar: puedeAutorizar,
      );

  @override
  Future<List<MiembroDeFamilia>> miFamilia() async => const [
        MiembroDeFamilia(
          residenteId: 'r1',
          nombre: 'Maria Titular',
          parentesco: 'Propietario',
          esTitular: true,
          nivelAcceso: 'acceso_completo',
          activo: true,
        ),
        MiembroDeFamilia(
          residenteId: 'r2',
          nombre: 'Antiguo Residente',
          parentesco: 'Hijo',
          esTitular: false,
          nivelAcceso: 'solo_ingreso',
          activo: false,
        ),
      ];

  @override
  Future<List<Vehiculo>> misVehiculos() async => const [
        Vehiculo(
          id: 'veh',
          placa: 'ABC123',
          marca: 'Marca',
          modelo: 'Modelo',
          color: 'Blanco',
          esPrincipal: true,
          activo: true,
        ),
      ];

  @override
  Future<List<Autorizacion>> misAutorizaciones() async => [
        Autorizacion(
          id: 'a',
          visitante: 'Visitante propio',
          tipo: 'unica',
          desde: DateTime.utc(2026, 9, 18, 10),
          hasta: DateTime.utc(2026, 9, 18, 14),
          placa: 'DEF456',
          permiteAccesoVehicular: true,
          estado: 'activa',
          acompanantes: 1,
        ),
      ];

  @override
  Future<List<EventoDeAcceso>> miHistorial(PeriodoDeHistorial periodo) async => [
        EventoDeAcceso(
          id: 'e',
          ocurridoEn: DateTime.utc(2026, 9, 18, 9),
          tipo: 'acceso',
          resultado: 'negado',
          motivo: 'FUERA_DE_HORARIO',
          metodo: 'placa',
          placaDetectada: 'DEF456',
          persona: 'Visitante propio',
          zona: 'Piscina',
          decididoPorEdge: true,
        ),
      ];

  @override
  Future<List<ZonaComun>> misZonas() async => zonas;

  @override
  Future<ResultadoDeVisita> crearVisita(NuevaVisita visita) async {
    if (falloAlCrear != null) throw falloAlCrear!;
    creadas.add(visita);
    return respuesta ?? const VisitaCreada(id: 'a-1', repetida: false);
  }

  @override
  Future<void> registrarAparato(AparatoDeNotificaciones aparato) async {
    aparatos.add(aparato);
  }

  final List<String> capturas = [];
@override
  Future<ResultadoDeCaptura> capturarRostro({
    required String autorizacionId,
    required MedidasDeCaptura medidas,
    required Uint8List vector,
    required String versionPolitica,
    required DateTime suprimirEn,
  }) async {
    capturas.add(autorizacionId);
    return const CapturaAceptada(
      consentimientoId: 'c-1',
      titular: 'Visitante de prueba',
      calidad: 0.8,
    );
  }
}

Widget envolver(Widget hijo) => MaterialApp(home: hijo);

void main() {
  testWidgets('M-1 · la vivienda, el distintivo y la actividad reciente', (t) async {
    final repo = RepositorioFalso();
    final inicio = controladorDeInicio(repo);
    final autorizaciones = controladorDeAutorizaciones(repo);
    await inicio.cargarAhora();
    await autorizaciones.cargarAhora();

    await t.pumpWidget(
      envolver(
        PantallaDeInicio(
          controlador: inicio,
          autorizaciones: autorizaciones,
          alPedirAcceso: () {},
          alAbrirFamilia: () {},
          alAbrirHistorial: () {},
          alAbrirVehiculos: () {},
        ),
      ),
    );
    await t.pumpAndSettle();

    expect(find.text('Casa 42 · Manzana B'), findsOneWidget);
    expect(find.text('Al día'), findsOneWidget);
    expect(find.text('Registrar visita'), findsOneWidget);

    // La actividad reciente vive al final de un `ListView`: en una pantalla de
    // prueba de 600 px no está construida hasta que se desplaza. Buscarla sin
    // desplazar daría un falso negativo — y, peor, un falso POSITIVO el día que
    // alguien la borre y la prueba siga buscando algo que nunca estuvo a la
    // vista.
    // `scrollable:` explícito: la pantalla tiene DOS —el `ListView` de fuera y
    // el `GridView` de los accesos rápidos—, y sin decir cuál, el ayudante de
    // Flutter falla con «Too many elements», que no dice nada de la causa.
    await t.scrollUntilVisible(
      find.text('Visitante propio'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Visitante propio'), findsOneWidget);
  });

  testWidgets('M-1 · con la vivienda inactiva, RN-13 se explica y el botón no está activo',
      (t) async {
    final repo = RepositorioFalso(puedeAutorizar: false, activa: false);
    final inicio = controladorDeInicio(repo);
    final autorizaciones = controladorDeAutorizaciones(repo);
    await inicio.cargarAhora();
    await autorizaciones.cargarAhora();

    await t.pumpWidget(
      envolver(
        PantallaDeInicio(
          controlador: inicio,
          autorizaciones: autorizaciones,
          alPedirAcceso: () {},
          alAbrirFamilia: () {},
          alAbrirHistorial: () {},
          alAbrirVehiculos: () {},
        ),
      ),
    );
    await t.pumpAndSettle();

    expect(find.textContaining('RN-13'), findsOneWidget);
    // El botón sigue visible —esconderlo dejaría al residente buscándolo— y no
    // responde. Se comprueba sobre el `InkWell`, que es quien recibe el toque:
    // un `Semantics` de adorno podría decir «habilitado» con el `onTap` nulo.
    final inkwell = t.widget<InkWell>(
      find.ancestor(of: find.text('Registrar visita'), matching: find.byType(InkWell)).first,
    );
    expect(inkwell.onTap, isNull);

    // Y el de un acceso que sí funciona, para que la aserción de arriba no pase
    // por estar mirando un widget que nunca tiene `onTap`.
    final vehiculos = t.widget<InkWell>(
      find.ancestor(of: find.text('Mis vehículos'), matching: find.byType(InkWell)).first,
    );
    expect(vehiculos.onTap, isNotNull);
  });

  testWidgets('M-2 · el residente desactivado aparece marcado (RN-19)', (t) async {
    final c = controladorDeFamilia(RepositorioFalso());
    await c.cargarAhora();

    await t.pumpWidget(envolver(PantallaDeFamilia(controlador: c, alPedirAcceso: () {})));
    await t.pumpAndSettle();

    expect(find.text('Maria Titular'), findsOneWidget);
    expect(find.text('Antiguo Residente'), findsOneWidget);
    expect(find.text('Desactivado'), findsOneWidget);
    // Y el conteo cuenta los ACTIVOS, no las filas.
    expect(find.text('1 residente(s) en su vivienda'), findsOneWidget);
    expect(find.textContaining('P-11'), findsOneWidget);
  });

  testWidgets('M-3 · la placa se muestra como la normalizó el dominio', (t) async {
    final c = controladorDeVehiculos(RepositorioFalso());
    await c.cargarAhora();

    await t.pumpWidget(envolver(Scaffold(body: PantallaDeVehiculos(controlador: c, alPedirAcceso: () {}))));
    await t.pumpAndSettle();

    expect(find.text('ABC123'), findsOneWidget);
    expect(find.text('Principal'), findsOneWidget);
    expect(find.text('Marca · Modelo · Blanco'), findsOneWidget);
  });

  testWidgets('M-6 · el motivo de la negación se explica, y lo del Edge se marca', (t) async {
    final c = ControladorDeHistorial(RepositorioFalso());
    await c.cargarAhora();

    await t.pumpWidget(envolver(PantallaDeHistorial(controlador: c, alPedirAcceso: () {})));
    await t.pumpAndSettle();

    // El mockup solo ponía el distintivo «Denegado»: el residente tiene derecho
    // a saber por qué.
    expect(find.text('La zona estaba cerrada a esa hora'), findsOneWidget);
    expect(find.text('Decidido en el conjunto, sin nube'), findsOneWidget);
    expect(find.text('Hoy'), findsOneWidget);
  });

  testWidgets('M-6 · un motivo desconocido se muestra tal cual, no como texto genérico', (t) async {
    expect(motivoLegible('MOTIVO_QUE_AUN_NO_EXISTE'), 'MOTIVO_QUE_AUN_NO_EXISTE');
    expect(motivoLegible('LISTA_NEGRA'), 'La persona o la placa está en lista negra');
  });

  testWidgets('M-8 · las notificaciones ya NO son un interruptor, y lo que sigue pendiente sí',
      (t) async {
    final repo = RepositorioFalso();
    final inicio = controladorDeInicio(repo);
    await inicio.cargarAhora();

    final sesion = SesionEnUso(
      almacen: AlmacenEnMemoria(),
      autenticador: _AutenticadorQuieto(),
      reloj: const RelojDelSistema(),
    );
    await sesion.iniciar(correo: 'residente@ejemplo.invalid', clave: 'x');

    await t.pumpWidget(
      envolver(
        Scaffold(
          body: PantallaDePerfil(
            sesion: sesion,
            controladorDeInicio: inicio,
            alCerrarSesion: () {},
            alPedirAcceso: () {},
            alAbrirFamilia: () {},
            alAbrirHistorial: () {},
            alAbrirNotificaciones: () {},
            estadoDeAvisos: EstadoDeAvisos.sinDeterminar,
          ),
        ),
      ),
    );
    await t.pumpAndSettle();

    expect(find.text('residente@ejemplo.invalid'), findsOneWidget);
    expect(find.text('Casa 42 · Manzana B'), findsOneWidget);

    // En 11-A las notificaciones eran dos interruptores apagados. Ahora son una
    // fila con estado, porque «activadas» resumía tres condiciones distintas y
    // dejaba al residente creyendo que le avisarían.
    expect(find.text('Notificaciones'), findsOneWidget);
    expect(find.text(resumenDeAvisos(EstadoDeAvisos.sinDeterminar)), findsOneWidget);

    final interruptores = t.widgetList<SwitchListTile>(find.byType(SwitchListTile));
    expect(interruptores.length, 1, reason: 'solo queda el resumen semanal');
    // `onChanged: null` es lo que lo deshabilita de verdad. Uno que se mueva y
    // no guarde nada es una mentira con animación.
    expect(interruptores.every((s) => s.onChanged == null), isTrue);
  });

  testWidgets('las pestañas de 11-B dicen qué falta en vez de quedarse mudas', (t) async {
    await t.pumpWidget(
      envolver(
        const Scaffold(
          body: PantallaPendiente(
            titulo: 'Visitantes',
            pantalla: 'M-4',
            detalle: 'Llega en 11-B con la cámara y el modo sin conexión.',
          ),
        ),
      ),
    );
    expect(find.text('Pantalla M-4 · en construcción'), findsOneWidget);
    expect(find.textContaining('modo sin conexión'), findsOneWidget);
  });
}

class _AutenticadorQuieto implements Autenticador {
  @override
  Future<Sesion> iniciarSesion({required String correo, required String clave}) async => Sesion(
        tokenDeAcceso: 'a',
        tokenDeRefresco: 'r',
        expiraEn: DateTime.now().add(const Duration(minutes: 5)),
        usuarioId: 'u',
        copropiedadId: 'c',
        correo: correo,
      );

  @override
  Future<Sesion> renovar(Sesion sesion) async => sesion;
}
