// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tope_de_plazas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TopeDePlazasDto _$TopeDePlazasDtoFromJson(Map<String, dynamic> json) =>
    TopeDePlazasDto(
      tope: json['tope'] as num,
      activas: json['activas'] as num,
      propio: json['propio'] as bool,
    );

Map<String, dynamic> _$TopeDePlazasDtoToJson(TopeDePlazasDto instance) =>
    <String, dynamic>{
      'tope': instance.tope,
      'activas': instance.activas,
      'propio': instance.propio,
    };
