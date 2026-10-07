/// Si el primer ingreso ofrece «Registrar mi rostro» (RONDA 15-X, D2, ADR-039).
///
/// Se ofrece mientras la cuenta NO tenga rostro y no haya respondido «Ahora
/// no». Esa respuesta se recuerda POR CUENTA en el almacén del teléfono
/// (Keychain o Keystore): otra cuenta del mismo teléfono recibe su propia
/// invitación, y quien ya dijo que no, no la vuelve a ver —lo tiene en «Mi
/// perfil → Mi rostro»—.
///
/// NUNCA BLOQUEA: si no se puede leer su estado (sin red, servidor caído) o el
/// llavero falla, no se ofrece y se entra a la app. Es una invitación, no un
/// paso obligatorio.
library;

import '../dominio/puertos.dart';
import '../dominio/rostro.dart';

class OfertaDelRostro {
  OfertaDelRostro({required this.rostro, required AlmacenDeTexto almacen}) : _almacen = almacen;

  /// El rostro de la cuenta: con él se lee el estado y se abre «Mi rostro».
  final RostroDelResidente rostro;
  final AlmacenDeTexto _almacen;

  static String claveDe(String cuenta) => 'ncr.rostro.ahora-no.$cuenta';

  Future<bool> seOfrece(String cuenta) async {
    if (cuenta.isEmpty) return false;
    try {
      if (await _almacen.leer(claveDe(cuenta)) != null) return false;
      return !(await rostro.miRostro()).tieneRostro;
    } on Exception {
      // Un `Fallo` de la API o un error del llavero: se entra sin la invitación.
      return false;
    }
  }

  /// «Ahora no»: no se le vuelve a ofrecer a ESTA cuenta en este teléfono.
  Future<void> ahoraNo(String cuenta) async {
    if (cuenta.isEmpty) return;
    await _almacen.escribir(claveDe(cuenta), 'si');
  }
}
