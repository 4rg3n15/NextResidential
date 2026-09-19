// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'orden_de_bloqueo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OrdenDeBloqueoDto _$OrdenDeBloqueoDtoFromJson(Map<String, dynamic> json) =>
    OrdenDeBloqueoDto(
      dispositivoId: json['dispositivoId'] as String,
      bloqueado: json['bloqueado'] as bool,
      motivo: json['motivo'] as String,
    );

Map<String, dynamic> _$OrdenDeBloqueoDtoToJson(OrdenDeBloqueoDto instance) =>
    <String, dynamic>{
      'dispositivoId': instance.dispositivoId,
      'bloqueado': instance.bloqueado,
      'motivo': instance.motivo,
    };
