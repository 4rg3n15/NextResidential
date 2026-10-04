// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reversion_de_modo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReversionDeModoDto _$ReversionDeModoDtoFromJson(Map<String, dynamic> json) =>
    ReversionDeModoDto(
      dispositivoId: json['dispositivoId'] as String,
      numeroDePuerta: json['numeroDePuerta'] as num,
      motivo: json['motivo'] as String?,
    );

Map<String, dynamic> _$ReversionDeModoDtoToJson(ReversionDeModoDto instance) =>
    <String, dynamic>{
      'dispositivoId': instance.dispositivoId,
      'numeroDePuerta': instance.numeroDePuerta,
      'motivo': instance.motivo,
    };
