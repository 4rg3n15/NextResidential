// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'pagina_de_viviendas_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PaginaDeViviendasDto _$PaginaDeViviendasDtoFromJson(
  Map<String, dynamic> json,
) => PaginaDeViviendasDto(
  totales: TotalesDeViviendasDto.fromJson(
    json['totales'] as Map<String, dynamic>,
  ),
  viviendas: (json['viviendas'] as List<dynamic>)
      .map((e) => ViviendaDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$PaginaDeViviendasDtoToJson(
  PaginaDeViviendasDto instance,
) => <String, dynamic>{
  'totales': instance.totales,
  'viviendas': instance.viviendas,
};
