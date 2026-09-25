// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'crear_autorizacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CrearAutorizacionDto _$CrearAutorizacionDtoFromJson(
  Map<String, dynamic> json,
) => CrearAutorizacionDto(
  viviendaId: json['viviendaId'] as String,
  personaId: json['personaId'] as String,
  desde: DateTime.parse(json['desde'] as String),
  hasta: DateTime.parse(json['hasta'] as String),
  zonasPermitidas: (json['zonasPermitidas'] as List<dynamic>?)
      ?.map((e) => e as String)
      .toList(),
  maximoAcompanantes: json['maximoAcompanantes'] as num?,
  patron: json['patron'] == null
      ? null
      : PatronDeEntradaDto.fromJson(json['patron'] as Map<String, dynamic>),
  placa: json['placa'] as String?,
  observaciones: json['observaciones'] as String?,
);

Map<String, dynamic> _$CrearAutorizacionDtoToJson(
  CrearAutorizacionDto instance,
) => <String, dynamic>{
  'viviendaId': instance.viviendaId,
  'personaId': instance.personaId,
  'desde': instance.desde.toIso8601String(),
  'hasta': instance.hasta.toIso8601String(),
  'zonasPermitidas': instance.zonasPermitidas,
  'maximoAcompanantes': instance.maximoAcompanantes,
  'patron': instance.patron,
  'placa': instance.placa,
  'observaciones': instance.observaciones,
};
