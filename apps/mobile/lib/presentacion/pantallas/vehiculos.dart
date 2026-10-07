import 'package:flutter/material.dart';

import '../../aplicacion/estado.dart';
import '../../configuracion/tema.dart';
import '../../dominio/entidades.dart';
import '../controlador.dart';
import '../widgets/estados.dart';
import 'comunes.dart';

/// M-3 · Mis Vehículos — HU-05, HU-06, y D5 a de la ETAPA 15-I.
///
/// Desde la 15-I el residente REGISTRA sus vehículos propios (activos al
/// instante, dentro del tope que la base cuenta). Desde la 15-W también los
/// EDITA —la placa sólo si no tienen historial— y los ELIMINA: sin historial se
/// borran, con historial quedan dados de baja, y el aviso dice cuál de los dos
/// pasó. Los que registró la administración sólo los toca la administración: el
/// servidor contesta «no» y la pantalla enseña su texto.
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
    this.alRegistrar,
    this.alEditar,
    this.alEliminar,
  });

  final ControladorDeVista controlador;
  final void Function() alPedirAcceso;

  /// `null` = sin alta desde la app (las pruebas de 11-A la montan así).
  final void Function()? alRegistrar;
  final Future<void> Function(Vehiculo vehiculo)? alEditar;
  final Future<void> Function(Vehiculo vehiculo)? alEliminar;

  @override
  Widget build(BuildContext context) {
    final lista = AnimatedBuilder(
      animation: controlador,
      builder: (context, _) => RefreshIndicator(
        onRefresh: controlador.refrescar,
        child: VistaConEstado<List<Vehiculo>>(
          estado: controlador.estado as Estado<List<Vehiculo>>,
          alReintentar: controlador.cargarAhora,
          alPedirAcceso: alPedirAcceso,
          mensajeVacio: alRegistrar == null
              ? 'No hay vehículos registrados en su vivienda.'
              : 'No hay vehículos registrados en su vivienda. Registre los suyos con el botón '
                    '«Registrar».',
          conDatos: (vehiculos, {required desdeCache}) => ListView(
            physics: const AlwaysScrollableScrollPhysics(),
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
              ...vehiculos.map((v) => _Vehiculo(v, alEditar: alEditar, alEliminar: alEliminar)),
              const SizedBox(height: 72),
            ],
          ),
        ),
      ),
    );
    final registrar = alRegistrar;
    if (registrar == null) return lista;
    return Scaffold(
      body: lista,
      floatingActionButton: FloatingActionButton.extended(
        key: const Key('vehiculos.registrar'),
        onPressed: registrar,
        icon: const Icon(Icons.add),
        label: const Text('Registrar'),
      ),
    );
  }
}

class _Vehiculo extends StatelessWidget {
  const _Vehiculo(this.v, {this.alEditar, this.alEliminar});
  final Vehiculo v;
  final Future<void> Function(Vehiculo vehiculo)? alEditar;
  final Future<void> Function(Vehiculo vehiculo)? alEliminar;

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
                if (v.esPrincipal) const Distintivo(texto: 'Principal', pareja: Paleta.exitoSuave),
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
            if (v.activo && (alEditar != null || alEliminar != null))
              Align(
                alignment: Alignment.centerRight,
                child: Wrap(
                  spacing: 4,
                  children: [
                    if (alEditar != null)
                      TextButton(
                        key: Key('vehiculos.editar.${v.placa}'),
                        onPressed: () => alEditar!(v),
                        child: const Text('Editar'),
                      ),
                    if (alEliminar != null)
                      TextButton(
                        key: Key('vehiculos.eliminar.${v.placa}'),
                        onPressed: () => alEliminar!(v),
                        child: const Text('Eliminar'),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
