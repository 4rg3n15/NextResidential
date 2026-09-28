/// Las notificaciones de la vivienda, desde la API (15-L).
///
/// Misma frontera que `repositorio_api.dart`: el cliente GENERADO adentro, la
/// entidad del dominio afuera. El texto del motivo llega como lo escribió
/// portería o la administración —la consola enseña el mismo—, y un tipo que la
/// API añada mañana no se adivina: llega como `otra`.
library;

import '../../aplicacion/sesion_en_uso.dart';
import '../../dominio/notificaciones.dart';
import 'generado/clients/residente_api.dart';
import 'generado/models/mi_notificacion_dto.dart';
import 'generado/models/mi_notificacion_dto_tipo.dart';
import 'soporte_de_api.dart';

class NotificacionesPorApi implements RepositorioDeNotificaciones {
  NotificacionesPorApi({required ResidenteApi api, required SesionEnUso sesion})
    : _api = api,
      _sesion = sesion;

  final ResidenteApi _api;
  final SesionEnUso _sesion;

  @override
  Future<List<Notificacion>> misNotificaciones() => pedirALaApi(() async {
    final dtos = await _api.misNotificacionesControllerNotificaciones(
      id: copropiedadDeLaSesion(_sesion),
    );
    return dtos.map(notificacionDe).toList(growable: false);
  });
}

Notificacion notificacionDe(MiNotificacionDto d) => Notificacion(
  id: d.id,
  tipo: switch (d.tipo) {
    MiNotificacionDtoTipo.visitaRechazada => TipoDeNotificacion.visitaRechazada,
    MiNotificacionDtoTipo.ingresoDeVisitante => TipoDeNotificacion.ingresoDeVisitante,
    MiNotificacionDtoTipo.$unknown => TipoDeNotificacion.otra,
  },
  en: d.en,
  visitante: d.visitante,
  motivo: d.motivo,
  autorizacionId: d.autorizacionId,
);
