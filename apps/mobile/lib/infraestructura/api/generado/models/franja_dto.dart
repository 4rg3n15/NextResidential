// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'franja_dto.g.dart';

@JsonSerializable()
class FranjaDto {
  const FranjaDto({
    required this.dia,
    required this.minutoInicio,
    required this.minutoFin,
    required this.continuaDelDiaAnterior,
  });
  
  factory FranjaDto.fromJson(Map<String, Object?> json) => _$FranjaDtoFromJson(json);
  
  /// Día 0..6 con domingo = 0.
  final num dia;
  final num minutoInicio;
  final num minutoFin;

  /// La franja viene del día anterior: una zona abierta de 22:00 a 02:00 son DOS franjas encadenadas, no una que reinicia a medianoche. El contador de aforo no se reinicia con el cambio de día (CU-05).
  final bool continuaDelDiaAnterior;

  Map<String, Object?> toJson() => _$FranjaDtoToJson(this);
}
