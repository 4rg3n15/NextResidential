// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'evento_ingesta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EventoIngestaDto _$EventoIngestaDtoFromJson(Map<String, dynamic> json) =>
    EventoIngestaDto(
      copropiedadId: json['copropiedadId'] as String,
      dispositivoId: json['dispositivoId'] as String,
      metodo: EventoIngestaDtoMetodo.fromJson(json['metodo'] as String),
      confianzaCentesimas: json['confianzaCentesimas'] as num,
      referenciaExterna: json['referenciaExterna'] as String,
      personaId: json['personaId'] as String?,
      placaLeida: json['placaLeida'] as String?,
      zonaId: json['zonaId'] as String?,
    );

Map<String, dynamic> _$EventoIngestaDtoToJson(EventoIngestaDto instance) =>
    <String, dynamic>{
      'copropiedadId': instance.copropiedadId,
      'dispositivoId': instance.dispositivoId,
      'metodo': instance.metodo,
      'personaId': instance.personaId,
      'placaLeida': instance.placaLeida,
      'zonaId': instance.zonaId,
      'confianzaCentesimas': instance.confianzaCentesimas,
      'referenciaExterna': instance.referenciaExterna,
    };
