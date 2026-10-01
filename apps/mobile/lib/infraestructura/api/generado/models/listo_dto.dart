// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'listo_dto.g.dart';

@JsonSerializable()
class ListoDto {
  const ListoDto({
    required this.estado,
    required this.dependencias,
    this.motivos,
    this.avisos,
  });
  
  factory ListoDto.fromJson(Map<String, Object?> json) => _$ListoDtoFromJson(json);
  
  final String estado;

  /// Estado por dependencia. Un 503 devuelve esta misma forma con el detalle.
  final Map<String, String> dependencias;

  /// 15-O · por qué una dependencia no está `ok`, en palabras y sin el texto del error (la ruta es pública).
  final Map<String, String>? motivos;

  /// 15-O · lo que conviene saber y NO saca la API del balanceador: el planificador (pg-boss) parado o reintentando, un corte reciente de la base ya repuesto.
  final Map<String, String>? avisos;

  Map<String, Object?> toJson() => _$ListoDtoToJson(this);
}
