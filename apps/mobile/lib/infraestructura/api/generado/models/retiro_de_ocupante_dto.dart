// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'retiro_de_ocupante_dto.g.dart';

@JsonSerializable()
class RetiroDeOcupanteDto {
  const RetiroDeOcupanteDto({
    required this.motivo,
  });
  
  factory RetiroDeOcupanteDto.fromJson(Map<String, Object?> json) => _$RetiroDeOcupanteDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$RetiroDeOcupanteDtoToJson(this);
}
