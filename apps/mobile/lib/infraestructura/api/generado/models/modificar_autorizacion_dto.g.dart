// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'modificar_autorizacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ModificarAutorizacionDto _$ModificarAutorizacionDtoFromJson(
  Map<String, dynamic> json,
) => ModificarAutorizacionDto(
  hasta: json['hasta'] == null ? null : DateTime.parse(json['hasta'] as String),
  placa: json['placa'] as String?,
  observaciones: json['observaciones'] as String?,
);

Map<String, dynamic> _$ModificarAutorizacionDtoToJson(
  ModificarAutorizacionDto instance,
) => <String, dynamic>{
  'hasta': instance.hasta?.toIso8601String(),
  'placa': instance.placa,
  'observaciones': instance.observaciones,
};
