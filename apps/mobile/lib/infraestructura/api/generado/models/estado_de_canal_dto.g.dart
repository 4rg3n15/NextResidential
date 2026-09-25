// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'estado_de_canal_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EstadoDeCanalDto _$EstadoDeCanalDtoFromJson(Map<String, dynamic> json) =>
    EstadoDeCanalDto(
      dispositivoId: json['dispositivoId'] as String,
      estado: EstadoDeCanalDtoEstado.fromJson(json['estado'] as String),
      porDelante: json['porDelante'] as num,
      titular: json['titular'] as String?,
      timeoutSegundos: json['timeoutSegundos'] as num,
      transporte: EstadoDeCanalDtoTransporte.fromJson(
        json['transporte'] as String,
      ),
      detalleTransporte: json['detalleTransporte'] as String?,
      formatoDeAudio: json['formatoDeAudio'] as String?,
    );

Map<String, dynamic> _$EstadoDeCanalDtoToJson(EstadoDeCanalDto instance) =>
    <String, dynamic>{
      'dispositivoId': instance.dispositivoId,
      'estado': instance.estado,
      'porDelante': instance.porDelante,
      'titular': instance.titular,
      'timeoutSegundos': instance.timeoutSegundos,
      'transporte': instance.transporte,
      'detalleTransporte': instance.detalleTransporte,
      'formatoDeAudio': instance.formatoDeAudio,
    };
