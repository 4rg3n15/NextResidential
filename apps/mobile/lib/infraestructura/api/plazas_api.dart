/// Las plazas del titular contra la API (RONDA 15-W, D-W10).
///
/// Añadir hasta el tope y retirar las libres. Cada respuesta trae las plazas
/// como quedaron, con sus códigos: la pantalla no hace otro viaje para saberlo.
/// El tope lo cuenta la BASE bajo su bloqueo; si dos teléfonos compiten por la
/// última plaza gana uno, y el otro recibe el 409 con el texto del servidor
/// («Su vivienda tiene el máximo de N plazas…»), que llega como `Fallo`.
library;

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/plazas.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/retiro_de_ocupante_dto.dart';
import 'hogar_api.dart' show ocupantesDe;
import 'soporte_de_api.dart';

class PlazasPorApi implements RepositorioDePlazas {
  PlazasPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  String get _copropiedad => copropiedadDeLaSesion(_sesion);

  @override
  Future<MisOcupantes> anadirPlaza() => pedirALaApi(() async {
    return ocupantesDe(await _api.misPlazasControllerAnadir(id: _copropiedad));
  });

  @override
  Future<MisOcupantes> retirarPlaza(String plazaId, {required String motivo}) =>
      pedirALaApi(() async {
        final d = await _api.misPlazasControllerRetirar(
          id: _copropiedad,
          plazaId: plazaId,
          body: RetiroDeOcupanteDto(motivo: motivo.trim()),
        );
        return ocupantesDe(d);
      });
}
