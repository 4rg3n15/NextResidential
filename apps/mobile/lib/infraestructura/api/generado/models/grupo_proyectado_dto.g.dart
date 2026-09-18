// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'grupo_proyectado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GrupoProyectadoDto _$GrupoProyectadoDtoFromJson(Map<String, dynamic> json) =>
    GrupoProyectadoDto(
      agrupacion: json['agrupacion'] as String?,
      cantidad: json['cantidad'] as num,
      primeras: (json['primeras'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      ultimas: (json['ultimas'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      porExcepcion: json['porExcepcion'] as bool,
    );

Map<String, dynamic> _$GrupoProyectadoDtoToJson(GrupoProyectadoDto instance) =>
    <String, dynamic>{
      'agrupacion': instance.agrupacion,
      'cantidad': instance.cantidad,
      'primeras': instance.primeras,
      'ultimas': instance.ultimas,
      'porExcepcion': instance.porExcepcion,
    };
