// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'confirmar_generacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ConfirmarGeneracionDto _$ConfirmarGeneracionDtoFromJson(
  Map<String, dynamic> json,
) => ConfirmarGeneracionDto(
  agrupaciones: json['agrupaciones'] as num,
  cantidad: json['cantidad'] as num,
  totalEsperado: json['totalEsperado'] as num,
  estilo: json['estilo'] == null
      ? null
      : ConfirmarGeneracionDtoEstilo.fromJson(json['estilo'] as String),
  porPiso: json['porPiso'] as num?,
  reiniciarNumeracion: json['reiniciarNumeracion'] as bool?,
  excepciones: (json['excepciones'] as List<dynamic>?)
      ?.map((e) => ExcepcionDeAgrupacionDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  modo: json['modo'] == null
      ? null
      : ConfirmarGeneracionDtoModo.fromJson(json['modo'] as String),
);

Map<String, dynamic> _$ConfirmarGeneracionDtoToJson(
  ConfirmarGeneracionDto instance,
) => <String, dynamic>{
  'agrupaciones': instance.agrupaciones,
  'estilo': instance.estilo,
  'cantidad': instance.cantidad,
  'porPiso': instance.porPiso,
  'reiniciarNumeracion': instance.reiniciarNumeracion,
  'excepciones': instance.excepciones,
  'modo': instance.modo,
  'totalEsperado': instance.totalEsperado,
};
