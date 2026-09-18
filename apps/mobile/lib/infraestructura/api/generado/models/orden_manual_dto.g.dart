// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'orden_manual_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OrdenManualDto _$OrdenManualDtoFromJson(Map<String, dynamic> json) =>
    OrdenManualDto(
      dispositivoId: json['dispositivoId'] as String,
      accion: OrdenManualDtoAccion.fromJson(json['accion'] as String),
      motivo: json['motivo'] as String,
      eventoId: json['eventoId'] as String?,
    );

Map<String, dynamic> _$OrdenManualDtoToJson(OrdenManualDto instance) =>
    <String, dynamic>{
      'dispositivoId': instance.dispositivoId,
      'accion': instance.accion,
      'motivo': instance.motivo,
      'eventoId': instance.eventoId,
    };
