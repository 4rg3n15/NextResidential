// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'informe_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

InformeDto _$InformeDtoFromJson(Map<String, dynamic> json) => InformeDto(
  tipo: InformeDtoTipo.fromJson(json['tipo'] as String),
  desde: DateTime.parse(json['desde'] as String),
  hasta: DateTime.parse(json['hasta'] as String),
  total: json['total'] as num,
  filas: (json['filas'] as List<dynamic>)
      .map((e) => FilaDeInformeDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  frecuencia: (json['frecuencia'] as List<dynamic>)
      .map((e) => PuntoDeFrecuenciaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  truncado: json['truncado'] as bool,
  notas: (json['notas'] as List<dynamic>).map((e) => e as String).toList(),
);

Map<String, dynamic> _$InformeDtoToJson(InformeDto instance) =>
    <String, dynamic>{
      'tipo': instance.tipo,
      'desde': instance.desde.toIso8601String(),
      'hasta': instance.hasta.toIso8601String(),
      'total': instance.total,
      'filas': instance.filas,
      'frecuencia': instance.frecuencia,
      'truncado': instance.truncado,
      'notas': instance.notas,
    };
