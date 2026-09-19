// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pendientes_dto.g.dart';

@JsonSerializable()
class PendientesDto {
  const PendientesDto({
    required this.dispositivos,
  });
  
  factory PendientesDto.fromJson(Map<String, Object?> json) => _$PendientesDtoFromJson(json);
  
  /// Identificadores de equipos con una orden sin ejecutar: se muestran «sincronizando».
  final List<String> dispositivos;

  Map<String, Object?> toJson() => _$PendientesDtoToJson(this);
}
