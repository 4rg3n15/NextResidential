// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pendientes_dto.g.dart';

@JsonSerializable()
class PendientesDto {
  const PendientesDto({
    required this.dispositivos,
    required this.ejecutaContraElEquipo,
    required this.detalleDeEjecucion,
  });
  
  factory PendientesDto.fromJson(Map<String, Object?> json) => _$PendientesDtoFromJson(json);
  
  /// Identificadores de equipos con una orden sin ejecutar: se muestran «sincronizando».
  final List<String> dispositivos;

  /// H-SITIO-02 · `false` si configurar, sincronizar y reiniciar sólo registran la orden sin llegar al equipo. La consola lo escribe en el botón.
  final bool ejecutaContraElEquipo;

  /// Qué hacen de verdad esas tres órdenes.
  final String detalleDeEjecucion;

  Map<String, Object?> toJson() => _$PendientesDtoToJson(this);
}
