// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_configuracion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeConfiguracionDto _$ResultadoDeConfiguracionDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoDeConfiguracionDto(
  aplicada: json['aplicada'] as bool,
  valorAnterior: json['valorAnterior'] as String?,
  valorNuevo: json['valorNuevo'] as String?,
  detalle: json['detalle'] as String,
);

Map<String, dynamic> _$ResultadoDeConfiguracionDtoToJson(
  ResultadoDeConfiguracionDto instance,
) => <String, dynamic>{
  'aplicada': instance.aplicada,
  'valorAnterior': instance.valorAnterior,
  'valorNuevo': instance.valorNuevo,
  'detalle': instance.detalle,
};
