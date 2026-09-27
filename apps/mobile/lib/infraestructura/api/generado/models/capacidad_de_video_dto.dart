// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'capacidad_de_video_dto_estado.dart';

part 'capacidad_de_video_dto.g.dart';

@JsonSerializable()
class CapacidadDeVideoDto {
  const CapacidadDeVideoDto({
    required this.estado,
    required this.codec,
    required this.canal,
  });
  
  factory CapacidadDeVideoDto.fromJson(Map<String, Object?> json) => _$CapacidadDeVideoDtoFromJson(json);
  
  final CapacidadDeVideoDtoEstado estado;

  /// «H.264», «H.265»…
  final String? codec;

  /// Canal preguntado (canal×100+flujo)
  final String? canal;

  Map<String, Object?> toJson() => _$CapacidadDeVideoDtoToJson(this);
}
