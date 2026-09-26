// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'plaza_de_ocupante_dto.g.dart';

@JsonSerializable()
class PlazaDeOcupanteDto {
  const PlazaDeOcupanteDto({
    required this.id,
    required this.numero,
    required this.libre,
    required this.codigo,
    required this.ocupante,
  });
  
  factory PlazaDeOcupanteDto.fromJson(Map<String, Object?> json) => _$PlazaDeOcupanteDtoFromJson(json);
  
  final String id;
  final num numero;
  final bool libre;

  /// Sólo en las libres: ABCD-EFGH
  final String? codigo;
  final String? ocupante;

  Map<String, Object?> toJson() => _$PlazaDeOcupanteDtoToJson(this);
}
