// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'franja_de_hoy_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FranjaDeHoyDto _$FranjaDeHoyDtoFromJson(Map<String, dynamic> json) =>
    FranjaDeHoyDto(
      desde: DateTime.parse(json['desde'] as String),
      hasta: DateTime.parse(json['hasta'] as String),
    );

Map<String, dynamic> _$FranjaDeHoyDtoToJson(FranjaDeHoyDto instance) =>
    <String, dynamic>{
      'desde': instance.desde.toIso8601String(),
      'hasta': instance.hasta.toIso8601String(),
    };
