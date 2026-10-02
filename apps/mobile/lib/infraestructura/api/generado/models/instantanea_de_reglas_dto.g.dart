// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'instantanea_de_reglas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InstantaneaDeReglasDto _$InstantaneaDeReglasDtoFromJson(
  Map<String, dynamic> json,
) => InstantaneaDeReglasDto(
  copropiedadId: json['copropiedadId'] as String,
  version: json['version'] as num,
  hash: json['hash'] as String,
  generadaEn: DateTime.parse(json['generadaEn'] as String),
  autorizaciones: (json['autorizaciones'] as List<dynamic>)
      .map(
        (e) =>
            AutorizacionEnLaInstantaneaDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  personasEnListaNegra: (json['personasEnListaNegra'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  placasEnListaNegra: (json['placasEnListaNegra'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  viviendasActivas: (json['viviendasActivas'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  vehiculos: (json['vehiculos'] as List<dynamic>)
      .map(
        (e) => VehiculoEnLaInstantaneaDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  zonas: (json['zonas'] as List<dynamic>)
      .map((e) => ZonaEnLaInstantaneaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  personasConConsentimiento:
      (json['personasConConsentimiento'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
  plantillas: (json['plantillas'] as List<dynamic>)
      .map(
        (e) => PlantillaEnLaInstantaneaDto.fromJson(e as Map<String, dynamic>),
      )
      .toList(),
  umbralDeConfianza: json['umbralDeConfianza'] as num,
);

Map<String, dynamic> _$InstantaneaDeReglasDtoToJson(
  InstantaneaDeReglasDto instance,
) => <String, dynamic>{
  'copropiedadId': instance.copropiedadId,
  'version': instance.version,
  'hash': instance.hash,
  'generadaEn': instance.generadaEn.toIso8601String(),
  'autorizaciones': instance.autorizaciones,
  'personasEnListaNegra': instance.personasEnListaNegra,
  'placasEnListaNegra': instance.placasEnListaNegra,
  'viviendasActivas': instance.viviendasActivas,
  'vehiculos': instance.vehiculos,
  'zonas': instance.zonas,
  'personasConConsentimiento': instance.personasConConsentimiento,
  'plantillas': instance.plantillas,
  'umbralDeConfianza': instance.umbralDeConfianza,
};
