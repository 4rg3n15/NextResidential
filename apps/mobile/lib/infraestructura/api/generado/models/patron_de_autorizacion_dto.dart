// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'patron_de_autorizacion_dto.g.dart';

@JsonSerializable()
class PatronDeAutorizacionDto {
  const PatronDeAutorizacionDto({
    required this.dias,
    required this.horaInicio,
    required this.horaFin,
  });
  
  factory PatronDeAutorizacionDto.fromJson(Map<String, Object?> json) => _$PatronDeAutorizacionDtoFromJson(json);
  
  /// Días de la semana, 0..6 con domingo = 0 (el vocabulario del dominio).
  final List<num> dias;
  final String horaInicio;
  final String horaFin;

  Map<String, Object?> toJson() => _$PatronDeAutorizacionDtoToJson(this);
}
