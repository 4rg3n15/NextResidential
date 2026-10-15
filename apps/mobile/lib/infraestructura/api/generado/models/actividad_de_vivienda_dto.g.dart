// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'actividad_de_vivienda_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ActividadDeViviendaDto _$ActividadDeViviendaDtoFromJson(
  Map<String, dynamic> json,
) => ActividadDeViviendaDto(
  viviendaId: json['viviendaId'] as String,
  identificador: json['identificador'] as String,
  agrupacion: json['agrupacion'] as String?,
  vehiculosEnVisita: json['vehiculosEnVisita'] as num,
  visitantesAhora: json['visitantesAhora'] as num,
);

Map<String, dynamic> _$ActividadDeViviendaDtoToJson(
  ActividadDeViviendaDto instance,
) => <String, dynamic>{
  'viviendaId': instance.viviendaId,
  'identificador': instance.identificador,
  'agrupacion': instance.agrupacion,
  'vehiculosEnVisita': instance.vehiculosEnVisita,
  'visitantesAhora': instance.visitantesAhora,
};
