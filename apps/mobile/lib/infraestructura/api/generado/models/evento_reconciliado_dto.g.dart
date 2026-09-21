// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'evento_reconciliado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

EventoReconciliadoDto _$EventoReconciliadoDtoFromJson(
  Map<String, dynamic> json,
) => EventoReconciliadoDto(
  copropiedadId: json['copropiedadId'] as String,
  dispositivoId: json['dispositivoId'] as String,
  metodo: EventoReconciliadoDtoMetodo.fromJson(json['metodo'] as String),
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
);

Map<String, dynamic> _$EventoReconciliadoDtoToJson(
  EventoReconciliadoDto instance,
) => <String, dynamic>{
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
};
