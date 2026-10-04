// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'orden_de_modo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OrdenDeModoDto _$OrdenDeModoDtoFromJson(Map<String, dynamic> json) =>
    OrdenDeModoDto(
      dispositivoId: json['dispositivoId'] as String,
      numeroDePuerta: json['numeroDePuerta'] as num,
      modo: OrdenDeModoDtoModo.fromJson(json['modo'] as String),
      motivo: json['motivo'] as String,
      minutos: json['minutos'] as num?,
    );

Map<String, dynamic> _$OrdenDeModoDtoToJson(OrdenDeModoDto instance) =>
    <String, dynamic>{
      'dispositivoId': instance.dispositivoId,
      'numeroDePuerta': instance.numeroDePuerta,
      'modo': instance.modo,
      'motivo': instance.motivo,
      'minutos': instance.minutos,
    };
