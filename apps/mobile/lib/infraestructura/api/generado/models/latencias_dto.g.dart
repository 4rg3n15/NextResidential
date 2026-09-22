// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'latencias_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LatenciasDto _$LatenciasDtoFromJson(Map<String, dynamic> json) => LatenciasDto(
  desde: json['desde'] as String,
  ventana: json['ventana'] as num,
  porProceso: json['porProceso'] as bool,
  filas: (json['filas'] as List<dynamic>)
      .map((e) => FilaDeLatenciaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$LatenciasDtoToJson(LatenciasDto instance) =>
    <String, dynamic>{
      'desde': instance.desde,
      'ventana': instance.ventana,
      'porProceso': instance.porProceso,
      'filas': instance.filas,
    };
