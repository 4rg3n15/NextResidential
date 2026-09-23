// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_correccion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeCorreccionDto _$ResultadoDeCorreccionDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoDeCorreccionDto(
  correccion: ResultadoDeCorreccionDtoCorreccion.fromJson(
    json['correccion'] as String,
  ),
  aplicada: json['aplicada'] as bool,
  valorAnterior: json['valorAnterior'] as String?,
  valorNuevo: json['valorNuevo'] as String?,
  detalle: json['detalle'] as String,
);

Map<String, dynamic> _$ResultadoDeCorreccionDtoToJson(
  ResultadoDeCorreccionDto instance,
) => <String, dynamic>{
  'correccion': instance.correccion,
  'aplicada': instance.aplicada,
  'valorAnterior': instance.valorAnterior,
  'valorNuevo': instance.valorNuevo,
  'detalle': instance.detalle,
};
