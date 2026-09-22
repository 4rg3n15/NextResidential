// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'fila_de_latencia_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FilaDeLatenciaDto _$FilaDeLatenciaDtoFromJson(Map<String, dynamic> json) =>
    FilaDeLatenciaDto(
      definicion: DefinicionKpiDto.fromJson(
        json['definicion'] as Map<String, dynamic>,
      ),
      muestras: json['muestras'] as num,
      observadas: json['observadas'] as num,
      incumplimientos: json['incumplimientos'] as num,
      p50: json['p50'] as num?,
      p95: json['p95'] as num?,
      p99: json['p99'] as num?,
      maximo: json['maximo'] as num?,
      cumple: json['cumple'] as bool?,
    );

Map<String, dynamic> _$FilaDeLatenciaDtoToJson(FilaDeLatenciaDto instance) =>
    <String, dynamic>{
      'definicion': instance.definicion,
      'muestras': instance.muestras,
      'observadas': instance.observadas,
      'incumplimientos': instance.incumplimientos,
      'p50': instance.p50,
      'p95': instance.p95,
      'p99': instance.p99,
      'maximo': instance.maximo,
      'cumple': instance.cumple,
    };
