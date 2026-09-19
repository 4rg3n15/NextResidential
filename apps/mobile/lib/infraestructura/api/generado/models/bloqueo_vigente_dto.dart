// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bloqueo_vigente_dto_resultado.dart';

part 'bloqueo_vigente_dto.g.dart';

@JsonSerializable()
class BloqueoVigenteDto {
  const BloqueoVigenteDto({
    required this.dispositivoId,
    required this.bloqueado,
    required this.motivo,
    required this.operadorId,
    required this.rol,
    required this.desde,
    required this.resultado,
    required this.detalle,
  });
  
  factory BloqueoVigenteDto.fromJson(Map<String, Object?> json) => _$BloqueoVigenteDtoFromJson(json);
  
  final String dispositivoId;
  final bool bloqueado;
  final String motivo;
  final String operadorId;
  final String rol;
  final DateTime desde;
  final BloqueoVigenteDtoResultado? resultado;
  final String? detalle;

  Map<String, Object?> toJson() => _$BloqueoVigenteDtoToJson(this);
}
