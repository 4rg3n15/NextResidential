// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'atestacion_de_equipo_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AtestacionDeEquipoDto _$AtestacionDeEquipoDtoFromJson(
  Map<String, dynamic> json,
) => AtestacionDeEquipoDto(
  id: json['id'] as String,
  firmware: json['firmware'] as String,
  placaEnListaBlanca: json['placaEnListaBlanca'] as String,
  placaDesconocida: json['placaDesconocida'] as String,
  evidencia: json['evidencia'] as String,
  registradaEn: json['registradaEn'] as String,
  registradaPor: json['registradaPor'] as String,
  vigente: json['vigente'] as bool,
  motivoSinEfecto: json['motivoSinEfecto'] as String?,
);

Map<String, dynamic> _$AtestacionDeEquipoDtoToJson(
  AtestacionDeEquipoDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'firmware': instance.firmware,
  'placaEnListaBlanca': instance.placaEnListaBlanca,
  'placaDesconocida': instance.placaDesconocida,
  'evidencia': instance.evidencia,
  'registradaEn': instance.registradaEn,
  'registradaPor': instance.registradaPor,
  'vigente': instance.vigente,
  'motivoSinEfecto': instance.motivoSinEfecto,
};
