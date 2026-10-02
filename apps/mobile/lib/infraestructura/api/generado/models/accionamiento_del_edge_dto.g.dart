// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'accionamiento_del_edge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AccionamientoDelEdgeDto _$AccionamientoDelEdgeDtoFromJson(
  Map<String, dynamic> json,
) => AccionamientoDelEdgeDto(
  tipo: AccionamientoDelEdgeDtoTipo.fromJson(json['tipo'] as String),
  estado: AccionamientoDelEdgeDtoEstado.fromJson(json['estado'] as String),
  latenciaMs: json['latenciaMs'] as num,
  ocurridoEn: json['ocurridoEn'] as String,
  motivo: json['motivo'] as String?,
);

Map<String, dynamic> _$AccionamientoDelEdgeDtoToJson(
  AccionamientoDelEdgeDto instance,
) => <String, dynamic>{
  'tipo': instance.tipo,
  'estado': instance.estado,
  'latenciaMs': instance.latenciaMs,
  'motivo': instance.motivo,
  'ocurridoEn': instance.ocurridoEn,
};
