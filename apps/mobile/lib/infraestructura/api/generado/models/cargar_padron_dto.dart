// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cargar_padron_dto.g.dart';

@JsonSerializable()
class CargarPadronDto {
  const CargarPadronDto({
    required this.csv,
  });
  
  factory CargarPadronDto.fromJson(Map<String, Object?> json) => _$CargarPadronDtoFromJson(json);
  
  /// Contenido CSV con cabecera; sin bytes nulos.
  final String csv;

  Map<String, Object?> toJson() => _$CargarPadronDtoToJson(this);
}
