/// El residente revoca una visita que autorizó (RONDA 15-W, D-W6).
///
/// Con motivo obligatorio. La visita del vecino no existe para él y una ya
/// revocada o vencida no se revoca otra vez: lo decide el SERVIDOR con su
/// reloj, y el botón sólo se ofrece donde tiene sentido. Al revocar, la foto
/// del visitante sale de los equipos del conjunto en la misma llamada, y el
/// aviso dice de cuántos salió: «listo» no es algo que se pueda comprobar.
library;

import 'entidades.dart';

/// El servidor admite hasta 200 caracteres de motivo.
const motivoMaximoDeRevocacion = 200;

/// Vigente o programada: lo que aún no venció ni se anuló. La situación es la
/// que mandó el servidor; una desconocida no se ofrece.
bool sePuedeRevocar(Autorizacion visita) =>
    visita.situacion == SituacionDeVisita.vigente ||
    visita.situacion == SituacionDeVisita.programada;

class VisitaRevocada {
  const VisitaRevocada({
    required this.rostrosSuprimidos,
    required this.equiposRetirados,
    required this.equiposPendientes,
  });
  final int rostrosSuprimidos;

  /// Equipos de los que ya salió la foto.
  final int equiposRetirados;

  /// Equipos que la retirarán al reintentar.
  final int equiposPendientes;

  String get texto {
    final partes = <String>[
      if (equiposRetirados > 0) 'Su foto salió de $equiposRetirados equipo(s)',
      if (equiposPendientes > 0) '$equiposPendientes más la retirará en cuanto responda',
    ];
    return partes.isEmpty ? 'Visita revocada.' : 'Visita revocada. ${partes.join('; ')}.';
  }
}

abstract interface class RevocacionDeVisitas {
  Future<VisitaRevocada> revocar(String autorizacionId, {required String motivo});
}
