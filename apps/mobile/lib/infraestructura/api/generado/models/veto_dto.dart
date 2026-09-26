// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'veto_dto.g.dart';

@JsonSerializable()
class VetoDto {
  const VetoDto({
    required this.motivo,
    this.placa,
    this.documento,
  });
  
  factory VetoDto.fromJson(Map<String, Object?> json) => _$VetoDtoFromJson(json);
  
  final String? placa;

  /// Documento de la persona a vetar; se resuelve en ESTA copropiedad
  final String? documento;
  final String motivo;

  Map<String, Object?> toJson() => _$VetoDtoToJson(this);
}
