// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'definicion_kpi_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DefinicionKpiDto _$DefinicionKpiDtoFromJson(Map<String, dynamic> json) =>
    DefinicionKpiDto(
      clave: json['clave'] as String,
      titulo: json['titulo'] as String,
      umbralMs: json['umbralMs'] as num,
      segmento: json['segmento'] as String,
      noIncluye: json['noIncluye'] as String,
      rnf: json['rnf'] as String,
      ca: json['ca'] as String?,
    );

Map<String, dynamic> _$DefinicionKpiDtoToJson(DefinicionKpiDto instance) =>
    <String, dynamic>{
      'clave': instance.clave,
      'titulo': instance.titulo,
      'umbralMs': instance.umbralMs,
      'segmento': instance.segmento,
      'noIncluye': instance.noIncluye,
      'rnf': instance.rnf,
      'ca': instance.ca,
    };
