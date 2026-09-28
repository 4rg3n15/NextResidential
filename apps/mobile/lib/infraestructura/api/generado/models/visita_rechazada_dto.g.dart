// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'visita_rechazada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

VisitaRechazadaDto _$VisitaRechazadaDtoFromJson(Map<String, dynamic> json) =>
    VisitaRechazadaDto(
      equiposRetirados: json['equiposRetirados'] as num,
      equiposPendientes: json['equiposPendientes'] as num,
    );

Map<String, dynamic> _$VisitaRechazadaDtoToJson(VisitaRechazadaDto instance) =>
    <String, dynamic>{
      'equiposRetirados': instance.equiposRetirados,
      'equiposPendientes': instance.equiposPendientes,
    };
