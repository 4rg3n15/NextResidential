// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'evento_registrado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EventoRegistradoDto _$EventoRegistradoDtoFromJson(Map<String, dynamic> json) =>
    EventoRegistradoDto(
      id: json['id'] as String,
      copropiedadId: json['copropiedadId'] as String,
      ocurridoEn: DateTime.parse(json['ocurridoEn'] as String),
      tipo: EventoRegistradoDtoTipo.fromJson(json['tipo'] as String),
      resultado: EventoRegistradoDtoResultado.fromJson(
        json['resultado'] as String,
      ),
      motivo: json['motivo'] == null
          ? null
          : EventoRegistradoDtoMotivo.fromJson(json['motivo'] as String),
      metodo: EventoRegistradoDtoMetodo.fromJson(json['metodo'] as String),
      personaId: json['personaId'] as String?,
      viviendaId: json['viviendaId'] as String?,
      zonaId: json['zonaId'] as String?,
      dispositivoId: json['dispositivoId'] as String,
      placaDetectada: json['placaDetectada'] as String?,
      confianza: json['confianza'] as num?,
      reglaAplicada: json['reglaAplicada'] as String,
      versionReglas: json['versionReglas'] as num,
      operadorId: json['operadorId'] as String?,
      motivoManual: json['motivoManual'] as String?,
      evidenciaId: json['evidenciaId'] as String?,
      decididoPorEdge: json['decididoPorEdge'] as bool,
    );

Map<String, dynamic> _$EventoRegistradoDtoToJson(
  EventoRegistradoDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'copropiedadId': instance.copropiedadId,
  'ocurridoEn': instance.ocurridoEn.toIso8601String(),
  'tipo': instance.tipo,
  'resultado': instance.resultado,
  'motivo': instance.motivo,
  'metodo': instance.metodo,
  'personaId': instance.personaId,
  'viviendaId': instance.viviendaId,
  'zonaId': instance.zonaId,
  'dispositivoId': instance.dispositivoId,
  'placaDetectada': instance.placaDetectada,
  'confianza': instance.confianza,
  'reglaAplicada': instance.reglaAplicada,
  'versionReglas': instance.versionReglas,
  'operadorId': instance.operadorId,
  'motivoManual': instance.motivoManual,
  'evidenciaId': instance.evidenciaId,
  'decididoPorEdge': instance.decididoPorEdge,
};
