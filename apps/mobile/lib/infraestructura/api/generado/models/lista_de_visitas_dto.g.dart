// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'lista_de_visitas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListaDeVisitasDto _$ListaDeVisitasDtoFromJson(
  Map<String, dynamic> json,
) => ListaDeVisitasDto(
  soloElDia: json['soloElDia'] as bool,
  desde: json['desde'] == null ? null : DateTime.parse(json['desde'] as String),
  hasta: json['hasta'] == null ? null : DateTime.parse(json['hasta'] as String),
  visitas: (json['visitas'] as List<dynamic>)
      .map((e) => VisitaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$ListaDeVisitasDtoToJson(ListaDeVisitasDto instance) =>
    <String, dynamic>{
      'soloElDia': instance.soloElDia,
      'desde': instance.desde?.toIso8601String(),
      'hasta': instance.hasta?.toIso8601String(),
      'visitas': instance.visitas,
    };
