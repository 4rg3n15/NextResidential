// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'parte_del_respaldo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ParteDelRespaldoDto _$ParteDelRespaldoDtoFromJson(Map<String, dynamic> json) =>
    ParteDelRespaldoDto(
      generados: json['generados'] as num,
      fallidosAlGenerar: json['fallidosAlGenerar'] as num,
      enviados: json['enviados'] as num,
      fallidosAlEnviar: json['fallidosAlEnviar'] as num,
      sinConfigurar: json['sinConfigurar'] as num,
    );

Map<String, dynamic> _$ParteDelRespaldoDtoToJson(
  ParteDelRespaldoDto instance,
) => <String, dynamic>{
  'generados': instance.generados,
  'fallidosAlGenerar': instance.fallidosAlGenerar,
  'enviados': instance.enviados,
  'fallidosAlEnviar': instance.fallidosAlEnviar,
  'sinConfigurar': instance.sinConfigurar,
};
