// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'ventana_del_dia_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VentanaDelDiaDto _$VentanaDelDiaDtoFromJson(Map<String, dynamic> json) =>
    VentanaDelDiaDto(
      desde: DateTime.parse(json['desde'] as String),
      hasta: DateTime.parse(json['hasta'] as String),
      zonaHoraria: json['zonaHoraria'] as String,
    );

Map<String, dynamic> _$VentanaDelDiaDtoToJson(VentanaDelDiaDto instance) =>
    <String, dynamic>{
      'desde': instance.desde.toIso8601String(),
      'hasta': instance.hasta.toIso8601String(),
      'zonaHoraria': instance.zonaHoraria,
    };
