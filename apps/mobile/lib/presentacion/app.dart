/// El armazón de la app: navegación, sesión y el ciclo de vida.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// AQUÍ VIVE LA CONDICIÓN QUE EL USUARIO PUSO POR ESCRITO
///
/// «Refresca al volver a primer plano, no de forma perezosa al recibir un 401.
/// Eso es lo que tumba una sesión tras la suspensión de la app.»
///
/// `_Armazon` implementa `WidgetsBindingObserver` y en
/// `AppLifecycleState.resumed` hace **dos** cosas, en este orden:
///
///   1. `sesion.alVolverAPrimerPlano()` — renueva si la política dice que toca.
///   2. Recarga lo que hay en pantalla, si renovó o si el dato ya es viejo.
///
/// El orden no es negociable: recargar primero enviaría la petición con el
/// token vencido, que es el 401 que se quiere evitar. Y el segundo paso existe
/// porque una sesión renovada sin recargar deja al residente mirando datos de
/// hace horas con una sesión nueva — técnicamente correcto, inútil.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// LA NAVEGACIÓN ES LA DEL MOCKUP, INCLUIDAS LAS DOS PESTAÑAS QUE AÚN NO SON
///
/// `03-mockups.md` §3 fija cinco pestañas —Inicio · Visitantes · Vehículos ·
/// Zonas · Perfil— y deja Mi Familia, Historial y Notificaciones fuera de la
/// barra, alcanzables desde Inicio y Perfil. Se respeta.
///
/// Visitantes (M-4) y Zonas (M-5) son de 11-B. **No se esconden**: la pestaña
/// está y explica qué falta, como la consola de guardia virtual explica que el
/// puente de vídeo llega en la 15 en vez de mostrar un recuadro negro. Quitar
/// las pestañas dejaría una barra de tres que habría que rehacer, y al
/// residente sin saber que lo que busca existe y aún no está.
library;

import 'package:flutter/material.dart';

import '../aplicacion/sesion_en_uso.dart';
import '../configuracion/ambiente.dart';
import '../configuracion/tema.dart';
import '../dominio/puertos.dart';
import 'controlador.dart';
import 'pantallas/acceso.dart';
import 'pantallas/familia.dart';
import 'pantallas/historial.dart';
import 'pantallas/inicio.dart';
import 'pantallas/perfil.dart';
import 'pantallas/pendiente.dart';
import 'pantallas/vehiculos.dart';

/// Todo lo que la app necesita, construido una vez en `main`.
class Dependencias {
  const Dependencias({
    required this.ambiente,
    required this.sesion,
    required this.repositorio,
    required this.reloj,
  });

  final Ambiente ambiente;
  final SesionEnUso sesion;
  final RepositorioDelResidente repositorio;
  final Reloj reloj;
}

class AppDelResidente extends StatelessWidget {
  const AppDelResidente({super.key, required this.dependencias});
  final Dependencias dependencias;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Next Control Residencial',
      debugShowCheckedModeBanner: false,
      theme: temaClaro(),
      darkTheme: temaOscuro(),
      home: Armazon(dependencias: dependencias),
    );
  }
}

class Armazon extends StatefulWidget {
  const Armazon({super.key, required this.dependencias});
  final Dependencias dependencias;

  @override
  State<Armazon> createState() => _ArmazonState();
}

class _ArmazonState extends State<Armazon> with WidgetsBindingObserver {
  late final ControladorDeVista _inicio = controladorDeInicio(_repo);
  late final ControladorDeVista _familia = controladorDeFamilia(_repo);
  late final ControladorDeVista _vehiculos = controladorDeVehiculos(_repo);
  late final ControladorDeVista _autorizaciones = controladorDeAutorizaciones(_repo);
  late final ControladorDeHistorial _historial = ControladorDeHistorial(_repo);

  RepositorioDelResidente get _repo => widget.dependencias.repositorio;
  SesionEnUso get _sesion => widget.dependencias.sesion;

  int _pestana = 0;
  bool _autenticado = false;
  DateTime? _ultimaCarga;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _autenticado = _sesion.haySesion;
    if (_autenticado) _cargarTodo();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    if (estado != AppLifecycleState.resumed || !_autenticado) return;
    alVolverAPrimerPlano();
  }

  /// Público para que la prueba de widget lo ejerza sin simular el sistema
  /// operativo: lo que hay que demostrar es el ORDEN —renovar y luego pedir—, y
  /// eso se prueba llamando a esto con un autenticador que cuenta llamadas.
  Future<void> alVolverAPrimerPlano() async {
    final renovo = await _sesion.alVolverAPrimerPlano();
    if (!mounted) return;
    if (!_sesion.haySesion) {
      // El refresco falló: la sesión está muerta y se pide acceso, en vez de
      // dejar en pantalla datos que ya no se pueden recargar.
      setState(() => _autenticado = false);
      return;
    }
    final viejo = _ultimaCarga == null ||
        widget.dependencias.reloj.ahora().difference(_ultimaCarga!) > const Duration(minutes: 2);
    if (renovo || viejo) _cargarTodo();
  }

  void _cargarTodo() {
    _ultimaCarga = widget.dependencias.reloj.ahora();
    _inicio.cargarAhora();
    _familia.cargarAhora();
    _vehiculos.cargarAhora();
    _autorizaciones.cargarAhora();
    _historial.cargarAhora();
  }

  void _cerrarSesion() {
    // Olvidar ANTES de cerrar: si se cerrara primero y la app se redibujara con
    // los controladores llenos, los datos del residente anterior seguirían en
    // pantalla un instante. En un teléfono compartido eso es una fuga.
    for (final c in [_inicio, _familia, _vehiculos, _autorizaciones, _historial]) {
      c.olvidar();
    }
    _sesion.cerrar();
    setState(() {
      _autenticado = false;
      _pestana = 0;
    });
  }

  void _pedirAcceso() => setState(() => _autenticado = false);

  void _abrir(Widget pantalla) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => pantalla));
  }

  @override
  Widget build(BuildContext context) {
    if (!_autenticado) {
      return PantallaDeAcceso(
        ambiente: widget.dependencias.ambiente,
        sesion: _sesion,
        alEntrar: () {
          setState(() => _autenticado = true);
          _cargarTodo();
        },
      );
    }

    final pantallas = <Widget>[
      PantallaDeInicio(
        controlador: _inicio,
        autorizaciones: _autorizaciones,
        alPedirAcceso: _pedirAcceso,
        alAbrirFamilia: () => _abrir(
          PantallaDeFamilia(controlador: _familia, alPedirAcceso: _pedirAcceso),
        ),
        alAbrirHistorial: () => _abrir(
          PantallaDeHistorial(controlador: _historial, alPedirAcceso: _pedirAcceso),
        ),
        alAbrirVehiculos: () => setState(() => _pestana = 2),
      ),
      const PantallaPendiente(
        titulo: 'Visitantes',
        pantalla: 'M-4',
        detalle:
            'Registrar un visitante —con su vigencia, sus acompañantes por nombre, el patrón de '
            'recurrencia y las zonas que podrá usar— llega en la ETAPA 11-B. Es la pantalla más '
            'crítica de la app y la única que escribe: se construye con la cámara, el modo sin '
            'conexión y la medición de los 60 segundos de KPI-10.',
      ),
      PantallaDeVehiculos(controlador: _vehiculos, alPedirAcceso: _pedirAcceso),
      const PantallaPendiente(
        titulo: 'Zonas comunes',
        pantalla: 'M-5',
        detalle:
            'El aforo en vivo y la solicitud de acceso llegan en la ETAPA 11-B. La API de zonas '
            'existe desde la ETAPA 07; lo que falta es la ruta acotada por vivienda que sustituye '
            'a la que se le retiró al residente por el defecto D-76.',
      ),
      PantallaDePerfil(
        sesion: _sesion,
        controladorDeInicio: _inicio,
        alCerrarSesion: _cerrarSesion,
        alPedirAcceso: _pedirAcceso,
        alAbrirFamilia: () => _abrir(
          PantallaDeFamilia(controlador: _familia, alPedirAcceso: _pedirAcceso),
        ),
        alAbrirHistorial: () => _abrir(
          PantallaDeHistorial(controlador: _historial, alPedirAcceso: _pedirAcceso),
        ),
      ),
    ];

    return Scaffold(
      body: SafeArea(child: pantallas[_pestana]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _pestana,
        onDestinationSelected: (i) => setState(() => _pestana = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), label: 'Inicio'),
          NavigationDestination(icon: Icon(Icons.person_add_alt_outlined), label: 'Visitantes'),
          NavigationDestination(icon: Icon(Icons.directions_car_outlined), label: 'Vehículos'),
          NavigationDestination(icon: Icon(Icons.pool_outlined), label: 'Zonas'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Perfil'),
        ],
      ),
    );
  }
}
