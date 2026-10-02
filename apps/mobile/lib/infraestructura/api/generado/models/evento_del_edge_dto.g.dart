// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'evento_del_edge_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EventoDelEdgeDto _$EventoDelEdgeDtoFromJson(Map<String, dynamic> json) =>
    EventoDelEdgeDto(
      copropiedadId: json['copropiedadId'] as String,
      dispositivoId: json['dispositivoId'] as String,
      metodo: EventoDelEdgeDtoMetodo.fromJson(json['metodo'] as String),
      confianzaCentesimas: json['confianzaCentesimas'] as num,
      referenciaExterna: json['referenciaExterna'] as String,
      ocurridoEn: json['ocurridoEn'] as String,
      decision: DecisionDelEdgeDto.fromJson(
        json['decision'] as Map<String, dynamic>,
      ),
      personaId: json['personaId'] as String?,
      placaLeida: json['placaLeida'] as String?,
      zonaId: json['zonaId'] as String?,
      cachePotencialmenteObsoleto: json['cachePotencialmenteObsoleto'] as bool?,
      accionamiento: json['accionamiento'] == null
          ? null
          : AccionamientoDelEdgeDto.fromJson(
              json['accionamiento'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$EventoDelEdgeDtoToJson(EventoDelEdgeDto instance) =>
    <String, dynamic>{
      'copropiedadId': instance.copropiedadId,
      'dispositivoId': instance.dispositivoId,
      'metodo': instance.metodo,
      'personaId': instance.personaId,
      'placaLeida': instance.placaLeida,
      'zonaId': instance.zonaId,
      'confianzaCentesimas': instance.confianzaCentesimas,
      'referenciaExterna': instance.referenciaExterna,
      'ocurridoEn': instance.ocurridoEn,
      'decision': instance.decision,
      'cachePotencialmenteObsoleto': instance.cachePotencialmenteObsoleto,
      'accionamiento': instance.accionamiento,
    };
