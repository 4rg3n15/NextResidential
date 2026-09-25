// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sincronizacion_total_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SincronizacionTotalDto _$SincronizacionTotalDtoFromJson(
  Map<String, dynamic> json,
) => SincronizacionTotalDto(
  plantillaId: json['plantillaId'] as String,
  terminales: json['terminales'] as num,
  sincronizadas: json['sincronizadas'] as num,
  fallidas: json['fallidas'] as num,
  porTerminal: (json['porTerminal'] as List<dynamic>)
      .map((e) => ResultadoPorTerminalDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$SincronizacionTotalDtoToJson(
  SincronizacionTotalDto instance,
) => <String, dynamic>{
  'plantillaId': instance.plantillaId,
  'terminales': instance.terminales,
  'sincronizadas': instance.sincronizadas,
  'fallidas': instance.fallidas,
  'porTerminal': instance.porTerminal,
};
