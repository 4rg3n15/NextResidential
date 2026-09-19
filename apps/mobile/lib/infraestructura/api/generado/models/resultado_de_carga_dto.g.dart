// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'resultado_de_carga_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResultadoDeCargaDto _$ResultadoDeCargaDtoFromJson(Map<String, dynamic> json) =>
    ResultadoDeCargaDto(
      aceptadas: json['aceptadas'] as num,
      errores: (json['errores'] as List<dynamic>)
          .map((e) => ErrorDeFilaDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      aplicada: json['aplicada'] as bool,
      filasLeidas: json['filasLeidas'] as num,
      viviendasCreadas: json['viviendasCreadas'] as num,
      personasCreadas: json['personasCreadas'] as num,
      identificadoresRecortados: json['identificadoresRecortados'] as num,
    );

Map<String, dynamic> _$ResultadoDeCargaDtoToJson(
  ResultadoDeCargaDto instance,
) => <String, dynamic>{
  'aceptadas': instance.aceptadas,
  'errores': instance.errores,
  'aplicada': instance.aplicada,
  'filasLeidas': instance.filasLeidas,
  'viviendasCreadas': instance.viviendasCreadas,
  'personasCreadas': instance.personasCreadas,
  'identificadoresRecortados': instance.identificadoresRecortados,
};
