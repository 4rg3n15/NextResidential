// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiVisitaDto _$MiVisitaDtoFromJson(Map<String, dynamic> json) => MiVisitaDto(
  inicio: DateTime.parse(json['inicio'] as String),
  duracionMinutos: json['duracionMinutos'] as num,
  nombre: json['nombre'] as String,
  documento: json['documento'] as String,
  claveDeIdempotencia: json['claveDeIdempotencia'] as String,
  placa: json['placa'] as String?,
  observaciones: json['observaciones'] as String?,
  casillaMarcada: json['casillaMarcada'] as bool?,
  foto: json['foto'] == null
      ? null
      : FotoDeVisitaDto.fromJson(json['foto'] as Map<String, dynamic>),
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
