// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'emergencia_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EmergenciaDto _$EmergenciaDtoFromJson(Map<String, dynamic> json) =>
    EmergenciaDto(
      motivo: json['motivo'] as String,
      dispositivoId: json['dispositivoId'] as String?,
    );

Map<String, dynamic> _$EmergenciaDtoToJson(EmergenciaDto instance) =>
    <String, dynamic>{
      'motivo': instance.motivo,
      'dispositivoId': instance.dispositivoId,
    };
