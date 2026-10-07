/// Los menores del hogar: residentes SIN cuenta (RONDA 15-W, D-W2, D4).
///
/// Sólo los mayores de 18 años tienen cuenta. Un menor es una persona de la
/// vivienda que ocupa una plaza sin cuenta, y lo registra, edita y da de baja
/// CUALQUIER adulto de su hogar. Su documento llega siempre enmascarado
/// («••••5678»): el número entero no sale del servidor hacia el teléfono.
///
/// La edad la calcula el SERVIDOR con su reloj y el día de Bogotá. Cuando un
/// menor cumple 18, el titular le genera un código de traspaso para que cree su
/// propia cuenta conservando su historial.
library;

import 'edad.dart';

const tiposDeDocumentoDeMenor = <String, String>{
  'tarjeta_identidad': 'Tarjeta de identidad',
  'registro_civil': 'Registro civil',
};

/// El servidor pide al menos cinco letras de motivo para la baja.
const motivoMinimoDeBaja = 5;

class MenorDelHogar {
  const MenorDelHogar({
    required this.residenteId,
    required this.nombres,
    required this.apellidos,
    required this.nombreCompleto,
    required this.fechaNacimiento,
    required this.edad,
    required this.tipoDocumento,
    required this.documento,
    required this.parentesco,
    required this.plazaId,
    required this.plazaNumero,
    required this.tieneRostro,
  });

  final String residenteId;
  final String? nombres;
  final String? apellidos;
  final String nombreCompleto;

  /// `AAAA-MM-DD`, o `null`.
  final String? fechaNacimiento;

  /// La del servidor. `null` sin fecha.
  final int? edad;
  final String tipoDocumento;

  /// Enmascarado: «••••5678».
  final String documento;
  final String? parentesco;
  final String? plazaId;
  final int? plazaNumero;
  final bool tieneRostro;

  /// Ya cumplió 18: crea su propia cuenta con un código de traspaso.
  bool get yaEsMayor => edad != null && puedeTenerCuenta(edad!);

  String get documentoLegible =>
      '${tiposDeDocumentoDeMenor[tipoDocumento] ?? 'Documento'} $documento';
}

/// Lo que se puede cambiar de un menor ya registrado.
class DatosDelMenor {
  const DatosDelMenor({
    required this.nombres,
    required this.apellidos,
    required this.fechaNacimiento,
    required this.parentesco,
  });
  final String nombres;
  final String apellidos;
  final String fechaNacimiento;
  final String parentesco;
}

class NuevoMenor {
  const NuevoMenor({
    required this.datos,
    required this.tipoDocumento,
    required this.numeroDocumento,
    required this.plazaId,
  });
  final DatosDelMenor datos;
  final String tipoDocumento;
  final String numeroDocumento;

  /// Una plaza LIBRE de la vivienda.
  final String plazaId;
}

/// Los menores de MI vivienda. Las escrituras que el servidor rechaza —un
/// mayor de edad, una plaza ya ocupada, un documento en uso— llegan como
/// `Fallo` con el texto del servidor.
abstract interface class RepositorioDeMenores {
  Future<List<MenorDelHogar>> misMenores();
  Future<void> registrarMenor(NuevoMenor menor);
  Future<void> editarMenor(String residenteId, DatosDelMenor datos);
  Future<void> darDeBajaMenor(String residenteId, {required String motivo});

  /// Sólo el titular, y sólo para quien ya cumplió 18. Un solo uso.
  Future<String> codigoDeTraspaso(String residenteId);
}
