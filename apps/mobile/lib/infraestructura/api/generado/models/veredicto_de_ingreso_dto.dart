// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'veredicto_de_ingreso_dto.g.dart';

@JsonSerializable()
class VeredictoDeIngresoDto {
  const VeredictoDeIngresoDto({
    required this.admitido,
    required this.conteo,
    required this.motivo,
  });
  
  factory VeredictoDeIngresoDto.fromJson(Map<String, Object?> json) => _$VeredictoDeIngresoDtoFromJson(json);
  
  final bool admitido;
  final num? conteo;
  final String? motivo;

  Map<String, Object?> toJson() => _$VeredictoDeIngresoDtoToJson(this);
}
