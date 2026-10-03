// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'reversion_de_modo_dto.g.dart';

@JsonSerializable()
class ReversionDeModoDto {
  const ReversionDeModoDto({
    required this.dispositivoId,
    required this.numeroDePuerta,
    this.motivo,
  });
  
  factory ReversionDeModoDto.fromJson(Map<String, Object?> json) => _$ReversionDeModoDtoFromJson(json);
  
  final String dispositivoId;
  final num numeroDePuerta;
  final String? motivo;

  Map<String, Object?> toJson() => _$ReversionDeModoDtoToJson(this);
}
