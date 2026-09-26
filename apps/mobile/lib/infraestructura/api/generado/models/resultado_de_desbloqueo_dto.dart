// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'resultado_de_desbloqueo_dto_resultado.dart';

part 'resultado_de_desbloqueo_dto.g.dart';

@JsonSerializable()
class ResultadoDeDesbloqueoDto {
  const ResultadoDeDesbloqueoDto({
    required this.resultado,
  });
  
  factory ResultadoDeDesbloqueoDto.fromJson(Map<String, Object?> json) => _$ResultadoDeDesbloqueoDtoFromJson(json);
  
  final ResultadoDeDesbloqueoDtoResultado resultado;

  Map<String, Object?> toJson() => _$ResultadoDeDesbloqueoDtoToJson(this);
}
