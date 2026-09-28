// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'repetir_visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RepetirVisitaDto _$RepetirVisitaDtoFromJson(Map<String, dynamic> json) =>
    RepetirVisitaDto(
      inicio: DateTime.parse(json['inicio'] as String),
      duracionMinutos: json['duracionMinutos'] as num,
      casillaMarcada: json['casillaMarcada'] as bool,
      claveDeIdempotencia: json['claveDeIdempotencia'] as String,
    );

Map<String, dynamic> _$RepetirVisitaDtoToJson(RepetirVisitaDto instance) =>
    <String, dynamic>{
      'inicio': instance.inicio.toIso8601String(),
      'duracionMinutos': instance.duracionMinutos,
      'casillaMarcada': instance.casillaMarcada,
      'claveDeIdempotencia': instance.claveDeIdempotencia,
    };
