/// El rostro de un menor de 15 a 17 años (RONDA 15-X, D3, ADR-039) · lo que la
/// app OFRECE; quien decide es el servidor.
///
/// ═════════════════════════════════════════════════════════════════════════════
/// QUIÉN LO REGISTRA
///
/// El titular del hogar, como representante legal del menor (Ley 1581, art. 7):
/// lo autoriza él, declarando que lo es y que el menor fue informado y está de
/// acuerdo. Desde los 15 años cumplidos y hasta la víspera de los 18; desde los
/// 18 la persona crea su propia cuenta y decide sobre su rostro. Vence al año
/// o al cumplir 18, lo que llegue antes.
///
/// La edad es la que manda el SERVIDOR en la lista de menores (con su reloj y
/// el día de Bogotá), y el servidor vuelve a comprobarlo todo —titular, menor
/// de SU vivienda, edad—: esto sólo evita ofrecer lo que va a negar.
/// ═════════════════════════════════════════════════════════════════════════════
library;

import 'edad.dart';
import 'menores.dart';
import 'rostro.dart';

/// [SUPUESTO] S-15W-01, el mismo número que el servidor.
const edadMinimaDelRostroDeMenor = 15;

/// Qué se ofrece en la ficha de un menor, según su edad y quién mira.
enum RostroDelMenorEnLaApp {
  /// El titular, con un menor de 15 a 17: registrar, ver y retirar.
  gestionar,

  /// Otro adulto del hogar: lo ve explicado, no lo gestiona.
  soloElTitular,
  desdeLos15,

  /// Ya cumplió 18: su rostro lo registra él desde su cuenta.
  yaEsMayor,
  sinFecha,
}

RostroDelMenorEnLaApp rostroDelMenorEnLaApp(MenorDelHogar m, {required bool esTitular}) {
  final edad = m.edad;
  if (edad == null) return RostroDelMenorEnLaApp.sinFecha;
  if (puedeTenerCuenta(edad)) return RostroDelMenorEnLaApp.yaEsMayor;
  if (edad < edadMinimaDelRostroDeMenor) return RostroDelMenorEnLaApp.desdeLos15;
  return esTitular ? RostroDelMenorEnLaApp.gestionar : RostroDelMenorEnLaApp.soloElTitular;
}

/// Lo que se le explica a quien no puede gestionarlo; `null` si no hay nada que
/// decir (lo gestiona, o ya es mayor y su ficha ofrece el código de traspaso).
String? explicacionDelRostroDelMenor(RostroDelMenorEnLaApp r) => switch (r) {
  RostroDelMenorEnLaApp.gestionar || RostroDelMenorEnLaApp.yaEsMayor => null,
  RostroDelMenorEnLaApp.soloElTitular => 'Lo registra el titular del hogar.',
  RostroDelMenorEnLaApp.desdeLos15 => 'No se registra el rostro de menores de 15 años.',
  RostroDelMenorEnLaApp.sinFecha =>
    'Registre su fecha de nacimiento para poder registrar su rostro.',
};

/// Los rostros de los menores de MI vivienda. Cada uno, con las mismas tres
/// operaciones que el propio; el servidor comprueba que quien pide sea el
/// titular y que el menor sea de su vivienda.
abstract interface class RostroDeMenores {
  RostroDelResidente de(String residenteId);
}
