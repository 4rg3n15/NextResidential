// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'resultado_por_terminal_dto.g.dart';

@JsonSerializable()
class ResultadoPorTerminalDto {
  const ResultadoPorTerminalDto({
    required this.dispositivoId,
    required this.nombre,
    required this.sincronizada,
    required this.detalle,
  });
  
  factory ResultadoPorTerminalDto.fromJson(Map<String, Object?> json) => _$ResultadoPorTerminalDtoFromJson(json);
  
  final String dispositivoId;
  final String nombre;
  final bool sincronizada;
  final String detalle;

  Map<String, Object?> toJson() => _$ResultadoPorTerminalDtoToJson(this);
}
