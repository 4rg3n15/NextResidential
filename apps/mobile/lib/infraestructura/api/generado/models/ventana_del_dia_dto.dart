// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'ventana_del_dia_dto.g.dart';

@JsonSerializable()
class VentanaDelDiaDto {
  const VentanaDelDiaDto({
    required this.desde,
    required this.hasta,
    required this.zonaHoraria,
  });
  
  factory VentanaDelDiaDto.fromJson(Map<String, Object?> json) => _$VentanaDelDiaDtoFromJson(json);
  
  /// Medianoche local, inclusive
  final DateTime desde;

  /// Medianoche local siguiente, exclusiva
  final DateTime hasta;

  /// Zona horaria de la copropiedad con la que se calculó «hoy». Se declara para que la consola no vuelva a interpretarlo con la zona del navegador.
  final String zonaHoraria;

  Map<String, Object?> toJson() => _$VentanaDelDiaDtoToJson(this);
}
