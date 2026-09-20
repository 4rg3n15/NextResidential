// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lote_de_reconciliacion_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LoteDeReconciliacionDto _$LoteDeReconciliacionDtoFromJson(
  Map<String, dynamic> json,
) => LoteDeReconciliacionDto(
  eventos: (json['eventos'] as List<dynamic>)
      .map((e) => EventoReconciliadoDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$LoteDeReconciliacionDtoToJson(
  LoteDeReconciliacionDto instance,
) => <String, dynamic>{'eventos': instance.eventos};
