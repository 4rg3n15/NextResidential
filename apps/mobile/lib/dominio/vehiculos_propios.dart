/// Editar y eliminar un vehículo propio (RONDA 15-W, D-W5, D5).
///
/// Se cambian el color, el modelo y la marca; la PLACA sólo si el vehículo no
/// tiene historial en el conjunto —con historial, una placa nueva es otro
/// vehículo, y el servidor lo dice—. El tipo no se edita. Eliminar lo decide
/// el servidor: sin historial lo borra, con historial lo da de baja y el
/// historial se conserva. La pantalla dice cuál de las dos pasó.
library;

class EdicionDeVehiculo {
  const EdicionDeVehiculo({
    required this.color,
    required this.modelo,
    required this.marca,
    required this.placa,
  });
  final String color;
  final String modelo;
  final String? marca;

  /// `null` = la placa no cambia.
  final String? placa;
}

enum EliminacionDeVehiculo { borrado, dadoDeBaja }

String textoDeEliminacion(EliminacionDeVehiculo e, String placa) => switch (e) {
  EliminacionDeVehiculo.borrado => 'Vehículo $placa eliminado.',
  EliminacionDeVehiculo.dadoDeBaja =>
    'El vehículo $placa ya tenía historial en el conjunto: quedó dado de baja y su '
        'historial se conserva.',
};
