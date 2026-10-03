// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'instantanea_sin_cambios_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InstantaneaSinCambiosDto _$InstantaneaSinCambiosDtoFromJson(
  Map<String, dynamic> json,
) => InstantaneaSinCambiosDto(
  copropiedadId: json['copropiedadId'] as String,
  version: json['version'] as num,
  sinCambios: InstantaneaSinCambiosDtoSinCambios.fromJson(
    json['sinCambios'] as bool,
  ),
  generadaEn: DateTime.parse(json['generadaEn'] as String),
);

Map<String, dynamic> _$InstantaneaSinCambiosDtoToJson(
  InstantaneaSinCambiosDto instance,
) => <String, dynamic>{
  'copropiedadId': instance.copropiedadId,
  'version': instance.version,
  'sinCambios': instance.sinCambios,
  'generadaEn': instance.generadaEn.toIso8601String(),
};
