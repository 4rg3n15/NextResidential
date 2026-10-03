// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'get_copropiedades_id_reglas_instantanea_response_sealed.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

Map<String, dynamic> _$GetCopropiedadesIdReglasInstantaneaResponseSealedToJson(
  GetCopropiedadesIdReglasInstantaneaResponseSealed instance,
) => <String, dynamic>{};

GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDto
_$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDtoFromJson(
  Map<String, dynamic> json,
) => GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDto(
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

Map<String, dynamic>
_$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDtoToJson(
  GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaDeReglasDto
  instance,
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

GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDto
_$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDtoFromJson(
  Map<String, dynamic> json,
) => GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDto(
  copropiedadId: json['copropiedadId'] as String,
  version: json['version'] as num,
  sinCambios: InstantaneaSinCambiosDtoSinCambios.fromJson(
    json['sinCambios'] as bool,
  ),
  generadaEn: DateTime.parse(json['generadaEn'] as String),
);

Map<String, dynamic>
_$GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDtoToJson(
  GetCopropiedadesIdReglasInstantaneaResponseSealedInstantaneaSinCambiosDto
  instance,
) => <String, dynamic>{
  'copropiedadId': instance.copropiedadId,
  'version': instance.version,
  'sinCambios': instance.sinCambios,
  'generadaEn': instance.generadaEn.toIso8601String(),
};
