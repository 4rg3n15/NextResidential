// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'excepcion_de_agrupacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ExcepcionDeAgrupacionDto _$ExcepcionDeAgrupacionDtoFromJson(
  Map<String, dynamic> json,
) => ExcepcionDeAgrupacionDto(
  agrupacion: json['agrupacion'] as String,
  pisos: json['pisos'] as num,
  porPiso: json['porPiso'] as num,
);

Map<String, dynamic> _$ExcepcionDeAgrupacionDtoToJson(
  ExcepcionDeAgrupacionDto instance,
) => <String, dynamic>{
  'agrupacion': instance.agrupacion,
  'pisos': instance.pisos,
  'porPiso': instance.porPiso,
};
