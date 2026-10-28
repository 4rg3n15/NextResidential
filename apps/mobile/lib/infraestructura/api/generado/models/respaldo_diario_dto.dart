// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'respaldo_diario_dto_estado_del_envio.dart';

part 'respaldo_diario_dto.g.dart';

@JsonSerializable()
class RespaldoDiarioDto {
  const RespaldoDiarioDto({
    required this.fecha,
    required this.numeroDeEventos,
    required this.permitidos,
    required this.negados,
    required this.sha256,
    required this.tamanoBytes,
    required this.generadoEn,
    required this.estadoDelEnvio,
    required this.enviadosA,
    required this.ultimoError,
  });
  
  factory RespaldoDiarioDto.fromJson(Map<String, Object?> json) => _$RespaldoDiarioDtoFromJson(json);
  
  /// Día de la copropiedad, AAAA-MM-DD (hora de Bogotá)
  final String fecha;
  final num numeroDeEventos;
  final num permitidos;
  final num negados;

  /// Huella SHA-256 del fichero, en hexadecimal
  final String sha256;
  final num tamanoBytes;
  final DateTime generadoEn;
  final RespaldoDiarioDtoEstadoDelEnvio estadoDelEnvio;

  /// Superadministradores a los que llegó
  final num enviadosA;

  /// Último fallo, sin direcciones
  final String? ultimoError;

  Map<String, Object?> toJson() => _$RespaldoDiarioDtoToJson(this);
}
