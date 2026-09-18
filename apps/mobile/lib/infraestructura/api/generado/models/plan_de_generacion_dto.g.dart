// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'plan_de_generacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PlanDeGeneracionDto _$PlanDeGeneracionDtoFromJson(Map<String, dynamic> json) =>
    PlanDeGeneracionDto(
      tipo: PlanDeGeneracionDtoTipo.fromJson(json['tipo'] as String),
      agrupaciones: json['agrupaciones'] as num?,
      estilo: json['estilo'] == null
          ? null
          : PlanDeGeneracionDtoEstilo.fromJson(json['estilo'] as String),
      pisos: json['pisos'] as num?,
      porPiso: json['porPiso'] as num?,
      excepciones: (json['excepciones'] as List<dynamic>?)
          ?.map(
            (e) => ExcepcionDeAgrupacionDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      secciones: json['secciones'] as num?,
      total: json['total'] as num?,
      reiniciarNumeracion: json['reiniciarNumeracion'] as bool?,
      cantidad: json['cantidad'] as num?,
    );

Map<String, dynamic> _$PlanDeGeneracionDtoToJson(
  PlanDeGeneracionDto instance,
) => <String, dynamic>{
  'tipo': instance.tipo,
  'agrupaciones': instance.agrupaciones,
  'estilo': instance.estilo,
  'pisos': instance.pisos,
  'porPiso': instance.porPiso,
  'excepciones': instance.excepciones,
  'secciones': instance.secciones,
  'total': instance.total,
  'reiniciarNumeracion': instance.reiniciarNumeracion,
  'cantidad': instance.cantidad,
};
