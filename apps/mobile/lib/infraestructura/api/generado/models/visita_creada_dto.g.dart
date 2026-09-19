// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'visita_creada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VisitaCreadaDto _$VisitaCreadaDtoFromJson(Map<String, dynamic> json) =>
    VisitaCreadaDto(
      creada: json['creada'] as bool,
      id: json['id'] as String?,
      repetida: json['repetida'] as bool,
      motivo: json['motivo'] == null
          ? null
          : VisitaCreadaDtoMotivo.fromJson(json['motivo'] as String),
      explicacion: json['explicacion'] as String?,
    );

Map<String, dynamic> _$VisitaCreadaDtoToJson(VisitaCreadaDto instance) =>
    <String, dynamic>{
      'creada': instance.creada,
      'id': instance.id,
      'repetida': instance.repetida,
      'motivo': instance.motivo,
      'explicacion': instance.explicacion,
    };
