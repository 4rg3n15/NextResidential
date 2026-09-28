// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiVisitaDto _$MiVisitaDtoFromJson(Map<String, dynamic> json) => MiVisitaDto(
  inicio: DateTime.parse(json['inicio'] as String),
  duracionMinutos: json['duracionMinutos'] as num,
  casillaMarcada: json['casillaMarcada'] as bool,
  nombre: json['nombre'] as String,
  documento: json['documento'] as String,
  foto: FotoDeVisitaDto.fromJson(json['foto'] as Map<String, dynamic>),
  claveDeIdempotencia: json['claveDeIdempotencia'] as String,
  placa: json['placa'] as String?,
  observaciones: json['observaciones'] as String?,
);

Map<String, dynamic> _$MiVisitaDtoToJson(MiVisitaDto instance) =>
    <String, dynamic>{
      'inicio': instance.inicio.toIso8601String(),
      'duracionMinutos': instance.duracionMinutos,
      'placa': instance.placa,
      'observaciones': instance.observaciones,
      'casillaMarcada': instance.casillaMarcada,
      'nombre': instance.nombre,
      'documento': instance.documento,
      'foto': instance.foto,
      'claveDeIdempotencia': instance.claveDeIdempotencia,
    };
