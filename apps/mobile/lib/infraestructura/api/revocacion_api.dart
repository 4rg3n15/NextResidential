/// La revocación de una visita propia contra la API (RONDA 15-W, D-W6).
///
/// La visita va en la RUTA y el servidor la busca en la vivienda de la
/// identidad: la del vecino es un 404 y una ya revocada o vencida, un 409 con
/// su texto («La visita ya está revocada»). Los dos llegan como `Fallo`.
library;

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/revocacion.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/revocacion_de_mi_visita_dto.dart';
import 'soporte_de_api.dart';

class RevocacionPorApi implements RevocacionDeVisitas {
  RevocacionPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  @override
  Future<VisitaRevocada> revocar(String autorizacionId, {required String motivo}) =>
      pedirALaApi(() async {
        final d = await _api.misVisitasControllerRevocarVisita(
          id: copropiedadDeLaSesion(_sesion),
          autorizacionId: autorizacionId,
          body: RevocacionDeMiVisitaDto(motivo: motivo.trim()),
        );
        return VisitaRevocada(
          rostrosSuprimidos: d.rostrosSuprimidos.toInt(),
          equiposRetirados: d.equiposRetirados.toInt(),
          equiposPendientes: d.equiposPendientes.toInt(),
        );
      });
}
