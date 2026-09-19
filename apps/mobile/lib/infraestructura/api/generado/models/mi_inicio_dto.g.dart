// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_inicio_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiInicioDto _$MiInicioDtoFromJson(Map<String, dynamic> json) => MiInicioDto(
  vivienda: MiViviendaDto.fromJson(json['vivienda'] as Map<String, dynamic>),
  vinculo: MiVinculoDto.fromJson(json['vinculo'] as Map<String, dynamic>),
  puedeAutorizar: json['puedeAutorizar'] as bool,
);

Map<String, dynamic> _$MiInicioDtoToJson(MiInicioDto instance) =>
    <String, dynamic>{
      'vivienda': instance.vivienda,
      'vinculo': instance.vinculo,
      'puedeAutorizar': instance.puedeAutorizar,
    };
