// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'error_api_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ErrorApiDto _$ErrorApiDtoFromJson(Map<String, dynamic> json) => ErrorApiDto(
  estado: json['estado'] as num,
  correlacion: json['correlacion'] as String,
  mensaje: json['mensaje'],
);

Map<String, dynamic> _$ErrorApiDtoToJson(ErrorApiDto instance) =>
    <String, dynamic>{
      'estado': instance.estado,
      'correlacion': instance.correlacion,
      'mensaje': instance.mensaje,
    };
