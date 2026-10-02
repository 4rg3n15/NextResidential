// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plantilla_en_la_instantanea_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlantillaEnLaInstantaneaDto _$PlantillaEnLaInstantaneaDtoFromJson(
  Map<String, dynamic> json,
) => PlantillaEnLaInstantaneaDto(
  plantillaId: json['plantillaId'] as String,
  personaId: json['personaId'] as String,
  reconocibleHasta: json['reconocibleHasta'] == null
      ? null
      : DateTime.parse(json['reconocibleHasta'] as String),
);

Map<String, dynamic> _$PlantillaEnLaInstantaneaDtoToJson(
  PlantillaEnLaInstantaneaDto instance,
) => <String, dynamic>{
  'plantillaId': instance.plantillaId,
  'personaId': instance.personaId,
  'reconocibleHasta': instance.reconocibleHasta?.toIso8601String(),
};
