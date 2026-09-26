// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'declaracion_de_ocupantes_dto.g.dart';

@JsonSerializable()
class DeclaracionDeOcupantesDto {
  const DeclaracionDeOcupantesDto({
    required this.numero,
    required this.confirmoQueEsDefinitivo,
  });
  
  factory DeclaracionDeOcupantesDto.fromJson(Map<String, Object?> json) => _$DeclaracionDeOcupantesDtoFromJson(json);
  
  final num numero;

  /// El residente confirmó que el número es DEFINITIVO
  final bool confirmoQueEsDefinitivo;

  Map<String, Object?> toJson() => _$DeclaracionDeOcupantesDtoToJson(this);
}
