// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'cambio_de_tope_de_plazas_dto.g.dart';

@JsonSerializable()
class CambioDeTopeDePlazasDto {
  const CambioDeTopeDePlazasDto({
    required this.tope,
    required this.motivo,
  });
  
  factory CambioDeTopeDePlazasDto.fromJson(Map<String, Object?> json) => _$CambioDeTopeDePlazasDtoFromJson(json);
  
  /// null = vuelve al tope de su copropiedad
  final num? tope;
  final String motivo;

  Map<String, Object?> toJson() => _$CambioDeTopeDePlazasDtoToJson(this);
}
