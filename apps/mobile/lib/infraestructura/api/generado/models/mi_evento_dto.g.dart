// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mi_evento_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MiEventoDto _$MiEventoDtoFromJson(Map<String, dynamic> json) => MiEventoDto(
  id: json['id'] as String,
  ocurridoEn: DateTime.parse(json['ocurridoEn'] as String),
  tipo: json['tipo'] as String,
  resultado: json['resultado'] as String?,
  motivo: json['motivo'] as String?,
  metodo: json['metodo'] as String,
  placaDetectada: json['placaDetectada'] as String?,
  persona: json['persona'] as String?,
  zona: json['zona'] as String?,
  decididoPorEdge: json['decididoPorEdge'] as bool,
);

Map<String, dynamic> _$MiEventoDtoToJson(MiEventoDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'ocurridoEn': instance.ocurridoEn.toIso8601String(),
      'tipo': instance.tipo,
      'resultado': instance.resultado,
      'motivo': instance.motivo,
      'metodo': instance.metodo,
      'placaDetectada': instance.placaDetectada,
      'persona': instance.persona,
      'zona': instance.zona,
      'decididoPorEdge': instance.decididoPorEdge,
    };
