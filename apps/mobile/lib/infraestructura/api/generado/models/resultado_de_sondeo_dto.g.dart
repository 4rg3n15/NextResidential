// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_sondeo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeSondeoDto _$ResultadoDeSondeoDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoDeSondeoDto(
  clase: ResultadoDeSondeoDtoClase.fromJson(json['clase'] as String),
  detalle: json['detalle'] as String,
  modelo: json['modelo'] as String?,
  firmware: json['firmware'] as String?,
  latenciaMs: json['latenciaMs'] as num?,
  verificado: json['verificado'] as bool,
);

Map<String, dynamic> _$ResultadoDeSondeoDtoToJson(
  ResultadoDeSondeoDto instance,
) => <String, dynamic>{
  'clase': instance.clase,
  'detalle': instance.detalle,
  'modelo': instance.modelo,
  'firmware': instance.firmware,
  'latenciaMs': instance.latenciaMs,
  'verificado': instance.verificado,
};
