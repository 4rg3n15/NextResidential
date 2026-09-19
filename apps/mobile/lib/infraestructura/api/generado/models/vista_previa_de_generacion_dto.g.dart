// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'vista_previa_de_generacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VistaPreviaDeGeneracionDto _$VistaPreviaDeGeneracionDtoFromJson(
  Map<String, dynamic> json,
) => VistaPreviaDeGeneracionDto(
  total: json['total'] as num,
  grupos: (json['grupos'] as List<dynamic>)
      .map((e) => GrupoProyectadoDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  colisiones: (json['colisiones'] as List<dynamic>)
      .map((e) => ViviendaProyectadaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$VistaPreviaDeGeneracionDtoToJson(
  VistaPreviaDeGeneracionDto instance,
) => <String, dynamic>{
  'total': instance.total,
  'grupos': instance.grupos,
  'colisiones': instance.colisiones,
};
