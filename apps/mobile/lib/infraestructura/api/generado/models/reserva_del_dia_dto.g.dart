// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'reserva_del_dia_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReservaDelDiaDto _$ReservaDelDiaDtoFromJson(Map<String, dynamic> json) =>
    ReservaDelDiaDto(
      id: json['id'] as String,
      titular: json['titular'] as String,
      desde: DateTime.parse(json['desde'] as String),
      hasta: DateTime.parse(json['hasta'] as String),
      personas: json['personas'] as num,
    );

Map<String, dynamic> _$ReservaDelDiaDtoToJson(ReservaDelDiaDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'titular': instance.titular,
      'desde': instance.desde.toIso8601String(),
      'hasta': instance.hasta.toIso8601String(),
      'personas': instance.personas,
    };
