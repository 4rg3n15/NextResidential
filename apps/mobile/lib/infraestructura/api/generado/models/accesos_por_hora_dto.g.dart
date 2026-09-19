// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'accesos_por_hora_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AccesosPorHoraDto _$AccesosPorHoraDtoFromJson(Map<String, dynamic> json) =>
    AccesosPorHoraDto(
      franjas: (json['franjas'] as List<dynamic>)
          .map((e) => FranjaDeAccesosDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      zonaHoraria: json['zonaHoraria'] as String,
      desde: DateTime.parse(json['desde'] as String),
      hasta: DateTime.parse(json['hasta'] as String),
    );

Map<String, dynamic> _$AccesosPorHoraDtoToJson(AccesosPorHoraDto instance) =>
    <String, dynamic>{
      'franjas': instance.franjas,
      'zonaHoraria': instance.zonaHoraria,
      'desde': instance.desde.toIso8601String(),
      'hasta': instance.hasta.toIso8601String(),
    };
