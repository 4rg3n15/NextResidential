import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

/// M-3 · Mis Vehículos — HU-05, HU-06 (lectura).
///
/// La placa se muestra **tal como la normalizó el objeto de valor `Placa`**, en
/// mayúsculas y sin separadores. No se re-formatea aquí: la app mostraría una
/// placa distinta de la que el motor de reglas compara, y el residente leería
/// «ABC-123» donde el sistema tiene «ABC123». Es la misma razón por la que la
/// palabra «Casa» no se guarda: un dato con dos formas acaba con dos verdades.
class PantallaDeVehiculos extends StatelessWidget {
  const PantallaDeVehiculos({
    super.key,
    required this.controlador,
    required this.alPedirAcceso,
  });

  final ControladorDeVista controlador;
  final void Function() alPedirAcceso;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controlador,
      builder: (context, _) => RefreshIndicator(
        onRefresh: controlador.cargarAhora,
        child: VistaConEstado<List<Vehiculo>>(
          estado: controlador.estado as Estado<List<Vehiculo>>,
          alReintentar: controlador.cargarAhora,
          alPedirAcceso: alPedirAcceso,
          mensajeVacio:
              'No hay vehículos registrados en su vivienda. Registrarlos desde la app llega en la '
              'ETAPA 11-B; hoy los registra la administración.',
          conDatos: (vehiculos, {required desdeCache}) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (desdeCache) const MarcaDeCache(),
              Text('Mis vehículos', style: Theme.of(context).textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text(
                '${vehiculos.where((v) => v.activo).length} vehículo(s) registrado(s) en su vivienda',
                style: const TextStyle(color: Paleta.textoSuave),
              ),
              const SizedBox(height: 16),
              ...vehiculos.map((v) => _Vehiculo(v)),
            ],
          ),
        ),
      ),
    );
  }
}

class _Vehiculo extends StatelessWidget {
  const _Vehiculo(this.v);
  final Vehiculo v;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                // La placa, con tipografía monoespaciada: es un identificador,
                // y un identificador se lee mejor con anchos fijos.
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Paleta.neutroSuave.fondo,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Paleta.borde),
                  ),
                  child: Text(
                    v.placa,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.5,
                      color: Paleta.neutroSuave.texto,
                    ),
                  ),
                ),
                const Spacer(),
                if (v.esPrincipal)
                  const Distintivo(texto: 'Principal', pareja: Paleta.exitoSuave),
                if (!v.activo) ...[
                  const SizedBox(width: 6),
                  const Distintivo(texto: 'Desactivado', pareja: Paleta.neutroSuave),
                ],
              ],
            ),
            if (v.descripcion.isNotEmpty) ...[
              const SizedBox(height: 10),
              Text(v.descripcion, style: const TextStyle(color: Paleta.textoSuave)),
            ],
          ],
        ),
      ),
    );
  }
}
