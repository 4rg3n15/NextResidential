// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'respaldo_diario_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RespaldoDiarioDto _$RespaldoDiarioDtoFromJson(Map<String, dynamic> json) =>
    RespaldoDiarioDto(
      fecha: json['fecha'] as String,
      numeroDeEventos: json['numeroDeEventos'] as num,
      permitidos: json['permitidos'] as num,
      negados: json['negados'] as num,
      sha256: json['sha256'] as String,
      tamanoBytes: json['tamanoBytes'] as num,
      generadoEn: DateTime.parse(json['generadoEn'] as String),
      estadoDelEnvio: RespaldoDiarioDtoEstadoDelEnvio.fromJson(
        json['estadoDelEnvio'] as String,
      ),
      enviadosA: json['enviadosA'] as num,
      ultimoError: json['ultimoError'] as String?,
    );

Map<String, dynamic> _$RespaldoDiarioDtoToJson(RespaldoDiarioDto instance) =>
    <String, dynamic>{
      'fecha': instance.fecha,
      'numeroDeEventos': instance.numeroDeEventos,
      'permitidos': instance.permitidos,
      'negados': instance.negados,
      'sha256': instance.sha256,
      'tamanoBytes': instance.tamanoBytes,
      'generadoEn': instance.generadoEn.toIso8601String(),
      'estadoDelEnvio': instance.estadoDelEnvio,
      'enviadosA': instance.enviadosA,
      'ultimoError': instance.ultimoError,
    };
