// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'capacidad_de_audio_dto_estado.dart';

part 'capacidad_de_audio_dto.g.dart';

@JsonSerializable()
class CapacidadDeAudioDto {
  const CapacidadDeAudioDto({
    required this.estado,
    required this.canal,
    required this.formato,
  });
  
  factory CapacidadDeAudioDto.fromJson(Map<String, Object?> json) => _$CapacidadDeAudioDtoFromJson(json);
  
  final CapacidadDeAudioDtoEstado estado;
  final num? canal;
  final String? formato;

  Map<String, Object?> toJson() => _$CapacidadDeAudioDtoToJson(this);
}
