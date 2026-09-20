// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_reconciliacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeReconciliacionDto _$ResultadoDeReconciliacionDtoFromJson(
  Map<String, dynamic> json,
) => ResultadoDeReconciliacionDto(
  claveIdempotencia: json['claveIdempotencia'] as String,
  aceptado: json['aceptado'] as bool,
  duplicado: json['duplicado'] as bool,
  detalle: json['detalle'] as String?,
);

Map<String, dynamic> _$ResultadoDeReconciliacionDtoToJson(
  ResultadoDeReconciliacionDto instance,
) => <String, dynamic>{
  'claveIdempotencia': instance.claveIdempotencia,
  'aceptado': instance.aceptado,
  'duplicado': instance.duplicado,
  'detalle': instance.detalle,
};
