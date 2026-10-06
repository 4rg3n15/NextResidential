// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vivienda_sin_titular_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ViviendaSinTitularDto _$ViviendaSinTitularDtoFromJson(
  Map<String, dynamic> json,
) => ViviendaSinTitularDto(
  id: json['id'] as String,
  identificador: json['identificador'] as String,
  agrupacion: json['agrupacion'] as String?,
);

Map<String, dynamic> _$ViviendaSinTitularDtoToJson(
  ViviendaSinTitularDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'identificador': instance.identificador,
  'agrupacion': instance.agrupacion,
};
