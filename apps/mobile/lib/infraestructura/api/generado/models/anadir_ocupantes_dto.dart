// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'anadir_ocupantes_dto.g.dart';

@JsonSerializable()
class AnadirOcupantesDto {
  const AnadirOcupantesDto({
    required this.cantidad,
    required this.motivo,
  });
  
  factory AnadirOcupantesDto.fromJson(Map<String, Object?> json) => _$AnadirOcupantesDtoFromJson(json);
  
  final num cantidad;
  final String motivo;

  Map<String, Object?> toJson() => _$AnadirOcupantesDtoToJson(this);
}
