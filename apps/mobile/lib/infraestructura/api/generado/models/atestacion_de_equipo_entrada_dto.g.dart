// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'atestacion_de_equipo_entrada_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AtestacionDeEquipoEntradaDto _$AtestacionDeEquipoEntradaDtoFromJson(
  Map<String, dynamic> json,
) => AtestacionDeEquipoEntradaDto(
  placaEnListaBlanca: json['placaEnListaBlanca'] as String,
  placaDesconocida: json['placaDesconocida'] as String,
  ningunaAbrio: json['ningunaAbrio'] as bool,
  evidencia: json['evidencia'] as String,
);

Map<String, dynamic> _$AtestacionDeEquipoEntradaDtoToJson(
  AtestacionDeEquipoEntradaDto instance,
) => <String, dynamic>{
  'placaEnListaBlanca': instance.placaEnListaBlanca,
  'placaDesconocida': instance.placaDesconocida,
  'ningunaAbrio': instance.ningunaAbrio,
  'evidencia': instance.evidencia,
};
