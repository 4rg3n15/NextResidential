// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'plantilla_en_la_instantanea_dto.g.dart';

@JsonSerializable()
class PlantillaEnLaInstantaneaDto {
  const PlantillaEnLaInstantaneaDto({
    required this.plantillaId,
    required this.personaId,
    required this.reconocibleHasta,
  });
  
  factory PlantillaEnLaInstantaneaDto.fromJson(Map<String, Object?> json) => _$PlantillaEnLaInstantaneaDtoFromJson(json);
  
  /// Identificador de la plantilla en la terminal; NUNCA el vector
  final String plantillaId;
  final String personaId;
  final DateTime? reconocibleHasta;

  Map<String, Object?> toJson() => _$PlantillaEnLaInstantaneaDtoToJson(this);
}
