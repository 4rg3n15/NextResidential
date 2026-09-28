import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import '../widgets/filas_de_visitas.dart';
import 'comunes.dart';

/// M-1 · Inicio / Mi Vivienda — HU-33.
///
/// El mockup pone: tarjeta de vivienda con el distintivo «Al día», cuatro
/// accesos rápidos y la actividad reciente. Aquí están los tres, con dos
/// diferencias que no son de estilo:
///
/// 1. **«Al día» sale del servidor** (`estadoAdministrativo`, alimentado
///    externamente, S-01). La app no calcula cartera: Next Control no la
///    conoce, y fabricar ese distintivo sería inventar un dato financiero.
/// 2. **«Registrar Visita» está deshabilitado si el servidor dice que no.**
///    `puedeAutorizar` viene decidido (RN-13 + RN-05). Dejar pulsar y luego
///    mostrar un error enseña a pulsar dos veces; y recomponer la regla en Dart
///    daría dos versiones de RN-13.
///
/// 15-L · y un contador de **notificaciones sin ver**, que sube solo mientras
/// la app está abierta: es donde el residente se entera de que portería
/// rechazó una visita sin tener que ir a buscarlo.
class PantallaDeInicio extends StatelessWidget {
  const PantallaDeInicio({
    super.key,
    required this.controlador,
    required this.autorizaciones,
    required this.alPedirAcceso,
    required this.alRegistrarVisita,
    required this.alAbrirFamilia,
    required this.alAbrirHistorial,
    required this.alAbrirVehiculos,
    this.sinVer,
    this.alAbrirNotificaciones,
    this.alRecargar,
  });

  final ControladorDeVista controlador;
  final ControladorDeVista autorizaciones;
  final void Function() alPedirAcceso;

  /// Cuántas notificaciones no ha visto. Sin él (una prueba suelta), no se
  /// pinta el contador.
  final ValueListenable<int>? sinVer;
  final void Function()? alAbrirNotificaciones;

  /// Tirar hacia abajo: la vuelta del ciclo del armazón, si la hay.
  final Future<void> Function()? alRecargar;

  Future<void> _recargar() async {
    final r = alRecargar;
    if (r != null) return r();
    await Future.wait([controlador.refrescar(), autorizaciones.refrescar()]);
  }

  /// Abre el formulario de «Nuevo visitante», el mismo de la pestaña.
  final void Function() alRegistrarVisita;
  final void Function() alAbrirFamilia;
  final void Function() alAbrirHistorial;
  final void Function() alAbrirVehiculos;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controlador,
      builder: (context, _) => RefreshIndicator(
        onRefresh: _recargar,
        child: VistaConEstado<MiHogar>(
          estado: controlador.estado as Estado<MiHogar>,
          alReintentar: controlador.cargarAhora,
          alPedirAcceso: alPedirAcceso,
          conDatos: (hogar, {required desdeCache}) => _Contenido(
            hogar: hogar,
            autorizaciones: autorizaciones,
            desdeCache: desdeCache,
            alRegistrarVisita: alRegistrarVisita,
            alAbrirFamilia: alAbrirFamilia,
            alAbrirHistorial: alAbrirHistorial,
            alAbrirVehiculos: alAbrirVehiculos,
            alPedirAcceso: alPedirAcceso,
            sinVer: sinVer,
            alAbrirNotificaciones: alAbrirNotificaciones,
          ),
        ),
      ),
    );
  }
}

class _Contenido extends StatelessWidget {
  const _Contenido({
    required this.hogar,
    required this.autorizaciones,
    required this.desdeCache,
    required this.alRegistrarVisita,
    required this.alAbrirFamilia,
    required this.alAbrirHistorial,
    required this.alAbrirVehiculos,
    required this.alPedirAcceso,
    required this.sinVer,
    required this.alAbrirNotificaciones,
  });

  final ValueListenable<int>? sinVer;
  final void Function()? alAbrirNotificaciones;
  final MiHogar hogar;
  final ControladorDeVista autorizaciones;
  final bool desdeCache;
  final void Function() alRegistrarVisita;
  final void Function() alAbrirFamilia;
  final void Function() alAbrirHistorial;
  final void Function() alAbrirVehiculos;
  final void Function() alPedirAcceso;

  @override
  Widget build(BuildContext context) {
    final v = hogar.vivienda;
    final contador = sinVer;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        if (desdeCache) const MarcaDeCache(),
        Text('Hola', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        v.titulo,
                        style: Theme.of(context)
                            .textTheme
                            .titleLarge
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    Distintivo(
                      texto: _etiquetaAdministrativa(v.estadoAdministrativo),
                      pareja: v.estadoAdministrativo == 'al_dia'
                          ? Paleta.exitoSuave
                          : Paleta.avisoSuave,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(v.copropiedadNombre, style: const TextStyle(color: Paleta.textoSuave)),
                if (v.direccion != null)
                  Text(v.direccion!, style: const TextStyle(color: Paleta.textoSuave)),
                if (!v.activa) ...[
                  const SizedBox(height: 12),
                  // RN-13 dicho en la pantalla: conserva lo vigente y no genera
                  // nuevo. Sin este aviso, el botón deshabilitado de abajo
                  // parecería un fallo de la app.
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Paleta.avisoSuave.fondo,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      'Su vivienda está inactiva: las autorizaciones vigentes siguen valiendo y no '
                      'se pueden crear nuevas. Consulte con la administración.',
                      style: TextStyle(color: Paleta.avisoSuave.texto),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        if (contador != null) ...[
          const SizedBox(height: 12),
          ValueListenableBuilder<int>(
            valueListenable: contador,
            builder: (context, n, _) => _Notificaciones(sinVer: n, alAbrir: alAbrirNotificaciones),
          ),
        ],
        const SizedBox(height: 20),
        Text('Accesos rápidos', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 2.4,
          children: [
            AccesoRapido(
              icono: Icons.person_add_alt_outlined,
              etiqueta: 'Registrar visita',
              // El servidor decide. `null` deshabilita, y el motivo se lee
              // arriba: ni un `if` de negocio en esta capa.
              alPulsar: hogar.puedeAutorizar ? alRegistrarVisita : null,
            ),
            AccesoRapido(
              icono: Icons.directions_car_outlined,
              etiqueta: 'Mis vehículos',
              alPulsar: alAbrirVehiculos,
            ),
            AccesoRapido(
              icono: Icons.people_outline,
              etiqueta: 'Mi familia',
              alPulsar: alAbrirFamilia,
            ),
            AccesoRapido(
              icono: Icons.history,
              etiqueta: 'Historial',
              alPulsar: alAbrirHistorial,
            ),
          ],
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: Text(
                'Actividad reciente',
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            TextButton(onPressed: alAbrirHistorial, child: const Text('Ver todo')),
          ],
        ),
        const SizedBox(height: 4),
        AnimatedBuilder(
          animation: autorizaciones,
          builder: (context, _) => VistaConEstado<List<Autorizacion>>(
            estado: autorizaciones.estado as Estado<List<Autorizacion>>,
            alReintentar: autorizaciones.cargarAhora,
            alPedirAcceso: alPedirAcceso,
            mensajeVacio: 'Sin visitas autorizadas por ahora.',
            esqueleto: const EsqueletoCorto(),
            conDatos: (lista, {required desdeCache}) => Column(
              children: lista.take(4).map((a) => FilaDeAutorizacion(a, conHasta: false)).toList(),
            ),
          ),
        ),
      ],
    );
  }

  String _etiquetaAdministrativa(String estado) => switch (estado) {
        'al_dia' => 'Al día',
        'en_mora' => 'En mora',
        _ => estado,
      };
}

/// El contador de lo que no ha visto. Es una fila y no sólo un punto rojo:
/// el número dice cuántas, y la frase dice qué son.
class _Notificaciones extends StatelessWidget {
  const _Notificaciones({required this.sinVer, required this.alAbrir});
  final int sinVer;
  final void Function()? alAbrir;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        key: const Key('inicio.notificaciones'),
        leading: Badge(
          isLabelVisible: sinVer > 0,
          label: Text('$sinVer'),
          child: const Icon(Icons.notifications_outlined),
        ),
        title: const Text('Notificaciones'),
        subtitle: Text(switch (sinVer) {
          0 => 'Nada nuevo',
          1 => '1 sin ver',
          _ => '$sinVer sin ver',
        }),
        trailing: const Icon(Icons.chevron_right),
        onTap: alAbrir,
      ),
    );
  }
}
