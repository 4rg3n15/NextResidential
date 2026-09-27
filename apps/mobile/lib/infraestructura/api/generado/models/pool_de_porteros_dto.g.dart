// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pool_de_porteros_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PoolDePorterosDto _$PoolDePorterosDtoFromJson(Map<String, dynamic> json) =>
    PoolDePorterosDto(
      inicio: json['inicio'] as num,
      fin: json['fin'] as num,
      siguiente: json['siguiente'] as num,
      cupo: json['cupo'] as num,
      activos: json['activos'] as num,
    );

Map<String, dynamic> _$PoolDePorterosDtoToJson(PoolDePorterosDto instance) =>
    <String, dynamic>{
      'inicio': instance.inicio,
      'fin': instance.fin,
      'siguiente': instance.siguiente,
      'cupo': instance.cupo,
      'activos': instance.activos,
    };
