// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'generar_visita_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GenerarVisitaDto _$GenerarVisitaDtoFromJson(Map<String, dynamic> json) =>
    GenerarVisitaDto(
      inicio: DateTime.parse(json['inicio'] as String),
      duracionMinutos: json['duracionMinutos'] as num,
      casillaMarcada: json['casillaMarcada'] as bool,
      nombre: json['nombre'] as String,
      tipoDocumento: GenerarVisitaDtoTipoDocumento.fromJson(
        json['tipoDocumento'] as String,
      ),
      documento: json['documento'] as String,
      viviendaId: json['viviendaId'] as String,
      foto: FotoDeVisitaDto.fromJson(json['foto'] as Map<String, dynamic>),
      placa: json['placa'] as String?,
      observaciones: json['observaciones'] as String?,
    );

Map<String, dynamic> _$GenerarVisitaDtoToJson(GenerarVisitaDto instance) =>
    <String, dynamic>{
      'inicio': instance.inicio.toIso8601String(),
      'duracionMinutos': instance.duracionMinutos,
      'placa': instance.placa,
      'observaciones': instance.observaciones,
      'casillaMarcada': instance.casillaMarcada,
      'nombre': instance.nombre,
      'tipoDocumento': instance.tipoDocumento,
      'documento': instance.documento,
      'viviendaId': instance.viviendaId,
      'foto': instance.foto,
    };
