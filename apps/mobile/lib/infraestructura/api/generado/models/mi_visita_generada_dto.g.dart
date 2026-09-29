// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_visita_generada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiVisitaGeneradaDto _$MiVisitaGeneradaDtoFromJson(Map<String, dynamic> json) =>
    MiVisitaGeneradaDto(
      creada: json['creada'] as bool,
      id: json['id'] as String?,
      repetida: json['repetida'] as bool,
      motivo: json['motivo'] == null
          ? null
          : MiVisitaGeneradaDtoMotivo.fromJson(json['motivo'] as String),
      explicacion: json['explicacion'] as String?,
      motivosDeFoto: (json['motivosDeFoto'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      equipos: json['equipos'] as num,
      sincronizadas: json['sincronizadas'] as num,
      fallidas: json['fallidas'] as num,
      avisoDeSincronizacion: json['avisoDeSincronizacion'] as String?,
      confirmacionDePlaca: json['confirmacionDePlaca'] as String?,
    );

Map<String, dynamic> _$MiVisitaGeneradaDtoToJson(
  MiVisitaGeneradaDto instance,
) => <String, dynamic>{
  'creada': instance.creada,
  'id': instance.id,
  'repetida': instance.repetida,
  'motivo': instance.motivo,
  'explicacion': instance.explicacion,
  'motivosDeFoto': instance.motivosDeFoto,
  'equipos': instance.equipos,
  'sincronizadas': instance.sincronizadas,
  'fallidas': instance.fallidas,
  'avisoDeSincronizacion': instance.avisoDeSincronizacion,
  'confirmacionDePlaca': instance.confirmacionDePlaca,
};
