// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'retiro_de_turno_dto.g.dart';

@JsonSerializable()
class RetiroDeTurnoDto {
  const RetiroDeTurnoDto({
    required this.motivo,
  });
  
  factory RetiroDeTurnoDto.fromJson(Map<String, Object?> json) => _$RetiroDeTurnoDtoFromJson(json);
  
  final String motivo;

  Map<String, Object?> toJson() => _$RetiroDeTurnoDtoToJson(this);
}
