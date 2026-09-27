// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'mi_notificacion_dto_tipo.dart';

part 'mi_notificacion_dto.g.dart';

@JsonSerializable()
class MiNotificacionDto {
  const MiNotificacionDto({
    required this.id,
    required this.tipo,
    required this.en,
    required this.visitante,
    required this.motivo,
    required this.autorizacionId,
  });
  
  factory MiNotificacionDto.fromJson(Map<String, Object?> json) => _$MiNotificacionDtoFromJson(json);
  
  /// Estable: la app la usa para saber qué ya vio
  final String id;
  final MiNotificacionDtoTipo tipo;
  final DateTime en;
  final String? visitante;
  final String? motivo;
  final String? autorizacionId;

  Map<String, Object?> toJson() => _$MiNotificacionDtoToJson(this);
}
