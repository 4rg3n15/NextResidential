import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
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
class PantallaDeInicio extends StatelessWidget {
  const PantallaDeInicio({
    super.key,
    required this.controlador,
    required this.autorizaciones,
    required this.alPedirAcceso,
    required this.alAbrirFamilia,
    required this.alAbrirHistorial,
    required this.alAbrirVehiculos,
  });

  final ControladorDeVista controlador;
  final ControladorDeVista autorizaciones;
  final void Function() alPedirAcceso;
  final void Function() alAbrirFamilia;
  final void Function() alAbrirHistorial;
  final void Function() alAbrirVehiculos;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controlador,
      builder: (context, _) => RefreshIndicator(
        onRefresh: controlador.cargarAhora,
        child: VistaConEstado<MiHogar>(
          estado: controlador.estado as Estado<MiHogar>,
          alReintentar: controlador.cargarAhora,
          alPedirAcceso: alPedirAcceso,
          conDatos: (hogar, {required desdeCache}) => _Contenido(
            hogar: hogar,
            autorizaciones: autorizaciones,
            desdeCache: desdeCache,
            alAbrirFamilia: alAbrirFamilia,
            alAbrirHistorial: alAbrirHistorial,
            alAbrirVehiculos: alAbrirVehiculos,
            alPedirAcceso: alPedirAcceso,
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
    required this.alAbrirFamilia,
    required this.alAbrirHistorial,
    required this.alAbrirVehiculos,
    required this.alPedirAcceso,
  });

  final MiHogar hogar;
  final ControladorDeVista autorizaciones;
  final bool desdeCache;
  final void Function() alAbrirFamilia;
  final void Function() alAbrirHistorial;
  final void Function() alAbrirVehiculos;
  final void Function() alPedirAcceso;

  @override
  Widget build(BuildContext context) {
    final v = hogar.vivienda;
    return ListView(
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
                      'se pueden crear nuevas (RN-13). Consulte con la administración.',
                      style: TextStyle(color: Paleta.avisoSuave.texto),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
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
              alPulsar: hogar.puedeAutorizar ? () => _avisoDe11B(context) : null,
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
              children: lista.take(4).map((a) => _FilaDeAutorizacion(a)).toList(),
            ),
          ),
        ),
      ],
    );
  }

  void _avisoDe11B(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Registrar visita llega en la ETAPA 11-B (pantalla M-4).'),
      ),
    );
  }

  String _etiquetaAdministrativa(String estado) => switch (estado) {
        'al_dia' => 'Al día',
        'en_mora' => 'En mora',
        _ => estado,
      };
}

class _FilaDeAutorizacion extends StatelessWidget {
  const _FilaDeAutorizacion(this.a);
  final Autorizacion a;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: const Icon(Icons.how_to_reg_outlined),
        title: Text(a.visitante),
        subtitle: Text(
          [
            a.tipo,
            if (a.placa != null) a.placa!,
            if (a.acompanantes > 0) '${a.acompanantes} acompañante(s)',
          ].join(' · '),
        ),
        trailing: Distintivo(
          texto: a.estado,
          pareja: a.estado == 'activa' ? Paleta.exitoSuave : Paleta.neutroSuave,
        ),
      ),
    );
  }
}
