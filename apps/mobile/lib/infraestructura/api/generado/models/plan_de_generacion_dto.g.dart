// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plan_de_generacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlanDeGeneracionDto _$PlanDeGeneracionDtoFromJson(Map<String, dynamic> json) =>
    PlanDeGeneracionDto(
      agrupaciones: json['agrupaciones'] as num,
      cantidad: json['cantidad'] as num,
      estilo: json['estilo'] == null
          ? null
          : PlanDeGeneracionDtoEstilo.fromJson(json['estilo'] as String),
      porPiso: json['porPiso'] as num?,
      reiniciarNumeracion: json['reiniciarNumeracion'] as bool?,
      excepciones: (json['excepciones'] as List<dynamic>?)
          ?.map(
            (e) => ExcepcionDeAgrupacionDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
    );

Map<String, dynamic> _$PlanDeGeneracionDtoToJson(
  PlanDeGeneracionDto instance,
) => <String, dynamic>{
  'agrupaciones': instance.agrupaciones,
  'estilo': instance.estilo,
  'cantidad': instance.cantidad,
  'porPiso': instance.porPiso,
  'reiniciarNumeracion': instance.reiniciarNumeracion,
  'excepciones': instance.excepciones,
};
