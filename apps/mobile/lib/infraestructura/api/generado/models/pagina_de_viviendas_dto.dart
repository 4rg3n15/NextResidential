// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'totales_de_viviendas_dto.dart';
import 'vivienda_dto.dart';

part 'pagina_de_viviendas_dto.g.dart';

@JsonSerializable()
class PaginaDeViviendasDto {
  const PaginaDeViviendasDto({
    required this.totales,
    required this.viviendas,
  });
  
  factory PaginaDeViviendasDto.fromJson(Map<String, Object?> json) => _$PaginaDeViviendasDtoFromJson(json);
  
  final TotalesDeViviendasDto totales;
  final List<ViviendaDto> viviendas;

  Map<String, Object?> toJson() => _$PaginaDeViviendasDtoToJson(this);
}
