// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'visita_generada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VisitaGeneradaDto _$VisitaGeneradaDtoFromJson(Map<String, dynamic> json) =>
    VisitaGeneradaDto(
      generada: json['generada'] as bool,
      autorizacionId: json['autorizacionId'] as String?,
      motivosDeFoto: (json['motivosDeFoto'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
      equipos: json['equipos'] as num,
      sincronizadas: json['sincronizadas'] as num,
      fallidas: json['fallidas'] as num,
      porEquipo: (json['porEquipo'] as List<dynamic>)
          .map(
            (e) =>
                EquipoDeLaSincronizacionDto.fromJson(e as Map<String, dynamic>),
          )
          .toList(),
      avisoDeSincronizacion: json['avisoDeSincronizacion'] as String?,
      confirmacionDePlaca: json['confirmacionDePlaca'] as String?,
    );

Map<String, dynamic> _$VisitaGeneradaDtoToJson(VisitaGeneradaDto instance) =>
    <String, dynamic>{
      'generada': instance.generada,
      'autorizacionId': instance.autorizacionId,
      'motivosDeFoto': instance.motivosDeFoto,
      'equipos': instance.equipos,
      'sincronizadas': instance.sincronizadas,
      'fallidas': instance.fallidas,
      'porEquipo': instance.porEquipo,
      'avisoDeSincronizacion': instance.avisoDeSincronizacion,
      'confirmacionDePlaca': instance.confirmacionDePlaca,
    };
