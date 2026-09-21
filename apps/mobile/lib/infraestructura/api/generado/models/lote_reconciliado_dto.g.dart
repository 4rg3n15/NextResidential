// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lote_reconciliado_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LoteReconciliadoDto _$LoteReconciliadoDtoFromJson(Map<String, dynamic> json) =>
    LoteReconciliadoDto(
      aceptado: json['aceptado'] as bool,
      resultados: (json['resultados'] as List<dynamic>)
          .map(
            (e) => ResultadoDeReconciliacionDto.fromJson(
              e as Map<String, dynamic>,
            ),
          )
          .toList(),
    );

Map<String, dynamic> _$LoteReconciliadoDtoToJson(
  LoteReconciliadoDto instance,
) => <String, dynamic>{
  'aceptado': instance.aceptado,
  'resultados': instance.resultados,
};
