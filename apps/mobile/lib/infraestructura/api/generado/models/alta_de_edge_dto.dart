// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'alta_de_edge_dto.g.dart';

@JsonSerializable()
class AltaDeEdgeDto {
  const AltaDeEdgeDto({
    required this.nombre,
  });
  
  factory AltaDeEdgeDto.fromJson(Map<String, Object?> json) => _$AltaDeEdgeDtoFromJson(json);
  
  /// Cómo lo verá el operador
  final String nombre;

  Map<String, Object?> toJson() => _$AltaDeEdgeDtoToJson(this);
}
