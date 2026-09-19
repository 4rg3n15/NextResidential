// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_operacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeOperacionDto _$ResultadoDeOperacionDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoDeOperacionDto(
  encolada: json['encolada'] as bool,
  operacion: ResultadoDeOperacionDtoOperacion.fromJson(
    json['operacion'] as String,
  ),
  estado: ResultadoDeOperacionDtoEstado.fromJson(json['estado'] as String),
  detalle: json['detalle'] as String,
);

Map<String, dynamic> _$ResultadoDeOperacionDtoToJson(
  ResultadoDeOperacionDto instance,
) => <String, dynamic>{
  'encolada': instance.encolada,
  'operacion': instance.operacion,
  'estado': instance.estado,
  'detalle': instance.detalle,
};
